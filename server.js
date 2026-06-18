const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { MongoClient, ObjectId } = require("mongodb");

loadEnv();

const port = Number(process.env.PORT || 3060);
const root = __dirname;
const mongoUri = process.env.MONGODB_URI || "";
const dbName = process.env.MONGODB_DB || "st-jupiter";
const tokenSecret = process.env.TOKEN_SECRET || crypto.createHash("sha256").update(mongoUri || "st-jupiter").digest("hex");
const faviconPath = path.join(root, "assets", "logo.png");

let dbPromise;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8"
};

function loadEnv() {
  const envFile = path.join(__dirname, ".env");
  if (!fs.existsSync(envFile)) return;

  fs.readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const index = trimmed.indexOf("=");
      if (index === -1) return;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    });
}

function envFlag(name, defaultValue = false) {
  const value = process.env[name];
  if (value == null) return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

async function getDb() {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing");
  }

  if (!dbPromise) {
    const client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000),
      connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 5000),
      socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS || 10000),
      tls: envFlag("MONGODB_TLS", true),
      family: Number(process.env.MONGODB_IP_FAMILY || 4),
      tlsAllowInvalidCertificates: envFlag("MONGODB_TLS_ALLOW_INVALID_CERTIFICATES", false),
      tlsAllowInvalidHostnames: envFlag("MONGODB_TLS_ALLOW_INVALID_HOSTNAMES", false)
    });
    dbPromise = client.connect().then(async () => {
      const db = client.db(dbName);
      await db.collection("users").createIndex({ email: 1 }, { unique: true });
      await db.collection("jobs").createIndex({ createdAt: -1 });
      await db.collection("jobs").createIndex({ specialty: 1, location: 1, jobType: 1 });
      await db.collection("contacts").createIndex({ createdAt: -1 });
      await db.collection("applications").createIndex({ createdAt: -1 });
      await ensureSeedData(db);
      return db;
    });
  }

  return dbPromise;
}

async function ensureSeedData(db) {
  const adminEmail = cleanText(process.env.ADMIN_EMAIL || "admin@stjupiter.com").toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || "admin12345");
  const admin = await db.collection("users").findOne({ email: adminEmail });

  if (!admin) {
    await db.collection("users").insertOne({
      name: "ST Jupiter Admin",
      email: adminEmail,
      accountType: "Admin",
      passwordHash: hashPassword(adminPassword),
      createdAt: new Date()
    });
  }

}

function resolveFile(urlPath) {
  const cleanPath = decodeURIComponent((urlPath || "/").split("?")[0]);
  if (cleanPath === "/favicon.ico") return faviconPath;
  if (cleanPath === "/crm") return path.join(root, "pages", "admin-dashboard.html");
  if (cleanPath === "/crm-login") return path.join(root, "pages", "admin-login.html");
  if (cleanPath === "/crm-reports") return path.join(root, "pages", "admin-reports.html");
  const safePath = path.normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
  const requested =
    cleanPath === "/" || safePath === "/" || safePath === "\\" || safePath === "." || safePath === ""
      ? path.join("pages", "index.html")
      : safePath.replace(/^[/\\]+/, "");
  const filePath = path.join(root, requested);
  return filePath.startsWith(root) ? filePath : path.join(root, "pages", "index.html");
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, status, contentType, data) {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(data);
}

function sendFile(req, res) {
  const filePath = resolveFile(req.url);
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>404</h1><p>Page not found.</p>");
      return;
    }

    const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    if (type.startsWith("text/html")) {
      const html = data.toString("utf8");
      const faviconMarkup = '<link rel="icon" type="image/png" href="/assets/logo.png" /><link rel="apple-touch-icon" href="/assets/logo.png" />';
      const output = html.includes('rel="icon"') ? html : html.replace("</head>", `    ${faviconMarkup}\n  </head>`);
      res.writeHead(200, { "Content-Type": type });
      res.end(output);
      return;
    }

    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

function getBaseUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || `localhost:${port}`;
  return `${proto}://${host}`;
}

function buildSitemap(baseUrl) {
  const routes = [
    "/",
    "/pages/about.html",
    "/pages/jobs.html",
    "/pages/hospitals.html",
    "/pages/doctors.html",
    "/pages/services.html",
    "/pages/success-stories.html",
    "/pages/blog.html",
    "/pages/contact.html",
    "/pages/post-job.html"
  ];
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = routes.map((route) => {
    return `<url><loc>${xmlEscape(`${baseUrl}${route}`)}</loc><lastmod>${lastmod}</lastmod></url>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function buildRobots(baseUrl) {
  return `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8_000_000) {
        req.destroy();
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}

function createToken(user) {
  const payload = Buffer.from(
    JSON.stringify({
      id: user._id.toString(),
      email: user.email,
      accountType: user.accountType,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7
    })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", tokenSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyToken(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = crypto.createHmac("sha256", tokenSecret).update(payload).digest("base64url");
  if (signature !== expected) return null;

  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return data.exp > Date.now() ? data : null;
}

function cleanText(value) {
  return String(value || "").trim();
}

function jobQueryFromUrl(reqUrl) {
  const url = new URL(reqUrl, "http://localhost");
  const query = {};
  const specialty = cleanText(url.searchParams.get("specialty"));
  const location = cleanText(url.searchParams.get("location"));
  const jobType = cleanText(url.searchParams.get("jobType"));

  if (specialty && specialty !== "All Specialties") query.specialty = specialty;
  if (jobType && jobType !== "All Job Types") query.jobType = jobType;
  if (location && location !== "All Locations") query.location = { $regex: location, $options: "i" };

  return query;
}

function isAdmin(authUser) {
  return String(authUser?.accountType || "").toLowerCase() === "admin";
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function parseAdminOptions(reqUrl, defaultLimit = 100) {
  const url = new URL(reqUrl, "http://localhost");
  const dataset = cleanText(url.searchParams.get("dataset") || "all").toLowerCase();
  const range = cleanText(url.searchParams.get("range") || "all").toLowerCase();
  const from = cleanText(url.searchParams.get("from"));
  const to = cleanText(url.searchParams.get("to"));
  const order = cleanText(url.searchParams.get("order") || "newest").toLowerCase();
  const limitValue = Number(url.searchParams.get("limit") || defaultLimit);
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 5000) : defaultLimit;
  return { dataset, range, from, to, order, limit };
}

function buildCreatedAtFilter({ range, from, to }) {
  const now = new Date();
  let start;
  let end;

  if (range === "today") {
    start = startOfDay(now);
    end = endOfDay(now);
  } else if (range === "last7") {
    start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
    end = endOfDay(now);
  } else if (range === "last30") {
    start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
    end = endOfDay(now);
  } else if (range === "thismonth") {
    start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    end = endOfDay(now);
  } else if (range === "custom") {
    if (from) start = startOfDay(new Date(from));
    if (to) end = endOfDay(new Date(to));
  }

  const filter = {};
  if (start && !Number.isNaN(start.getTime())) filter.$gte = start;
  if (end && !Number.isNaN(end.getTime())) filter.$lte = end;
  return Object.keys(filter).length ? filter : null;
}

function getAdminQuery(options) {
  const createdAt = buildCreatedAtFilter(options);
  return createdAt ? { createdAt } : {};
}

async function fetchAdminCollection(db, collectionName, query, sortDirection, limit) {
  const options = collectionName === "users" ? { projection: { passwordHash: 0 } } : {};
  let cursor = db.collection(collectionName).find(query, options).sort({ createdAt: sortDirection });
  if (limit > 0) cursor = cursor.limit(limit);
  return cursor.toArray();
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function exportValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value == null ? "" : String(value);
}

function worksheetXml(name, columns, rows) {
  const header = columns.map((column) => `<Cell ss:StyleID="header"><Data ss:Type="String">${xmlEscape(column.label)}</Data></Cell>`).join("");
  const body = rows.map((row) => {
    const cells = columns.map((column) => `<Cell><Data ss:Type="String">${xmlEscape(exportValue(column.value(row)))}</Data></Cell>`).join("");
    return `<Row>${cells}</Row>`;
  }).join("");

  return `
    <Worksheet ss:Name="${xmlEscape(name.slice(0, 31))}">
      <Table>
        <Row>${header}</Row>
        ${body}
      </Table>
    </Worksheet>
  `;
}

function buildExcelWorkbook(sheets) {
  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#E6F4F0" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  ${sheets.join("")}
</Workbook>`;
}

function sendExcel(res, filename, workbook) {
  res.writeHead(200, {
    "Content-Type": "application/vnd.ms-excel; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store"
  });
  res.end(workbook);
}

const adminExportColumns = {
  users: [
    { label: "Name", value: (row) => row.name },
    { label: "Email", value: (row) => row.email },
    { label: "Account Type", value: (row) => row.accountType },
    { label: "Profile Complete", value: (row) => row.profileComplete ? "Yes" : "No" },
    { label: "Specialty", value: (row) => row.profile?.specialty || "" },
    { label: "Location", value: (row) => row.profile?.location || "" },
    { label: "Experience", value: (row) => row.profile?.experience || "" },
    { label: "Qualification", value: (row) => row.profile?.qualification || "" },
    { label: "Resume Note", value: (row) => row.profile?.resumeNote || "" },
    { label: "CV File", value: (row) => row.assets?.cv?.name || "" },
    { label: "CV Uploaded At", value: (row) => row.assets?.cv?.uploadedAt || "" },
    { label: "Profile Image", value: (row) => row.assets?.profileImage?.name || "" },
    { label: "Created At", value: (row) => row.createdAt }
  ],
  jobs: [
    { label: "Hospital", value: (row) => row.hospitalName },
    { label: "Email", value: (row) => row.email },
    { label: "Specialty", value: (row) => row.specialty },
    { label: "Location", value: (row) => row.location },
    { label: "Job Type", value: (row) => row.jobType },
    { label: "Requirement", value: (row) => row.message },
    { label: "Created At", value: (row) => row.createdAt }
  ],
  contacts: [
    { label: "Name", value: (row) => row.name },
    { label: "Phone", value: (row) => row.phone },
    { label: "Role", value: (row) => row.role },
    { label: "Message", value: (row) => row.message },
    { label: "Created At", value: (row) => row.createdAt }
  ],
  applications: [
    { label: "Doctor Email", value: (row) => row.doctorEmail },
    { label: "Doctor Type", value: (row) => row.doctorType },
    { label: "Specialty", value: (row) => row.specialty },
    { label: "Hospital", value: (row) => row.hospitalName },
    { label: "Location", value: (row) => row.location },
    { label: "Job Type", value: (row) => row.jobType },
    { label: "Message", value: (row) => row.message },
    { label: "Created At", value: (row) => row.createdAt }
  ]
};

async function handleApi(req, res) {
  try {
    const db = await getDb();

    if (req.method === "POST" && req.url === "/api/register") {
      const body = await readBody(req);
      const name = cleanText(body.name);
      const email = cleanText(body.email).toLowerCase();
      const accountType = cleanText(body.accountType || "Doctor");
      const password = String(body.password || "");

      if (!name || !email || !password) {
        return sendJson(res, 400, { message: "Name, email, and password are required." });
      }

      const user = {
        name,
        email,
        accountType,
        passwordHash: hashPassword(password),
        profileComplete: false,
        createdAt: new Date()
      };

      await db.collection("users").insertOne(user);
      const token = createToken(user);
      return sendJson(res, 201, {
        message: "Registration successful.",
        token,
        user: { name, email, accountType, profileComplete: false },
        redirect: accountType.toLowerCase() === "admin"
          ? "/crm"
          : "/pages/complete-profile.html"
      });
    }

    if (req.method === "POST" && req.url === "/api/login") {
      const body = await readBody(req);
      const email = cleanText(body.email || body.loginEmail).toLowerCase();
      const password = String(body.password || body.loginPassword || "");
      const user = await db.collection("users").findOne({ email });

      if (!user || !verifyPassword(password, user.passwordHash)) {
        return sendJson(res, 401, { message: "Invalid email or password." });
      }

      const token = createToken(user);
      return sendJson(res, 200, {
        message: "Login successful.",
        token,
        user: { name: user.name, email: user.email, accountType: user.accountType, profileComplete: Boolean(user.profileComplete) },
        redirect: String(user.accountType || "").toLowerCase() === "admin"
          ? "/crm"
          : !user.profileComplete
            ? "/pages/complete-profile.html"
            : String(user.accountType || "").toLowerCase().includes("doctor")
            ? "/pages/doctor-dashboard.html"
            : "/pages/hospital-dashboard.html"
      });
    }

    if (req.method === "GET" && req.url === "/api/me") {
      const authUser = verifyToken(req);
      if (!authUser) return sendJson(res, 401, { message: "Please login again." });
      const user = await db.collection("users").findOne({ _id: new ObjectId(authUser.id) }, { projection: { passwordHash: 0 } });
      return sendJson(res, 200, { user });
    }

    if (req.method === "POST" && req.url === "/api/profile") {
      const authUser = verifyToken(req);
      if (!authUser) return sendJson(res, 401, { message: "Please login again." });
      const body = await readBody(req);
      const accountType = String(authUser.accountType || "");
      const profile = accountType.toLowerCase().includes("doctor")
        ? {
            specialty: cleanText(body.specialty),
            location: cleanText(body.location),
            experience: cleanText(body.experience),
            qualification: cleanText(body.qualification),
            resumeNote: cleanText(body.resumeNote)
          }
        : {
            hospitalName: cleanText(body.hospitalName),
            location: cleanText(body.location),
            contactPerson: cleanText(body.contactPerson),
            hiringNeeds: cleanText(body.hiringNeeds)
          };

      await db.collection("users").updateOne(
        { _id: new ObjectId(authUser.id) },
        { $set: { profile, profileComplete: true, updatedAt: new Date() } }
      );

      return sendJson(res, 200, {
        message: "Profile completed successfully.",
        redirect: accountType.toLowerCase().includes("doctor") ? "/pages/doctor-dashboard.html" : "/pages/hospital-dashboard.html"
      });
    }

    if (req.method === "GET" && req.url.startsWith("/api/doctors")) {
      const url = new URL(req.url, "http://localhost");
      const term = cleanText(url.searchParams.get("q")).toLowerCase();
      const specialty = cleanText(url.searchParams.get("specialty"));
      const location = cleanText(url.searchParams.get("location"));
      const query = { accountType: { $regex: "doctor", $options: "i" }, profileComplete: true };

      if (specialty && specialty !== "All Specialties") query["profile.specialty"] = { $regex: specialty, $options: "i" };
      if (location && location !== "All Locations") query["profile.location"] = { $regex: location, $options: "i" };

      let doctors = await db.collection("users").find(query, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).limit(100).toArray();
      if (term) {
        doctors = doctors.filter((doctor) => JSON.stringify(doctor).toLowerCase().includes(term));
      }
      return sendJson(res, 200, { doctors });
    }

    if (req.method === "POST" && req.url === "/api/profile-assets") {
      const authUser = verifyToken(req);
      if (!authUser) return sendJson(res, 401, { message: "Please login again." });
      const body = await readBody(req);
      const kind = cleanText(body.kind);
      if (!["profileImage", "cv"].includes(kind)) {
        return sendJson(res, 400, { message: "Invalid upload type." });
      }
      const asset = {
        name: cleanText(body.name),
        type: cleanText(body.type),
        dataUrl: String(body.dataUrl || ""),
        uploadedAt: new Date()
      };
      await db.collection("users").updateOne(
        { _id: new ObjectId(authUser.id) },
        { $set: { [`assets.${kind}`]: asset, updatedAt: new Date() } }
      );
      return sendJson(res, 200, { message: "Upload saved.", asset });
    }

    if (req.method === "GET" && req.url.startsWith("/api/jobs")) {
      const query = jobQueryFromUrl(req.url);
      const jobs = await db.collection("jobs").find(query).sort({ createdAt: -1 }).limit(50).toArray();
      return sendJson(res, 200, { jobs });
    }

    if (req.method === "GET" && req.url === "/api/dashboard") {
      const authUser = verifyToken(req);
      if (!authUser) return sendJson(res, 401, { message: "Please login again." });

      const user = await db.collection("users").findOne({ _id: new ObjectId(authUser.id) }, { projection: { passwordHash: 0 } });
      const jobs = await db.collection("jobs").find({}).sort({ createdAt: -1 }).limit(8).toArray();
      const applications = await db.collection("applications").find({ userId: new ObjectId(authUser.id) }).sort({ createdAt: -1 }).limit(50).toArray();
      const postedJobs = await db.collection("jobs").find({ email: authUser.email }).sort({ createdAt: -1 }).limit(50).toArray();
      return sendJson(res, 200, { user, jobs, applications, postedJobs });
    }

    if (req.method === "POST" && req.url === "/api/contact") {
      const body = await readBody(req);
      const contact = {
        name: cleanText(body.name),
        phone: cleanText(body.phone),
        role: cleanText(body.role),
        message: cleanText(body.message),
        createdAt: new Date()
      };
      await db.collection("contacts").insertOne(contact);
      return sendJson(res, 201, { message: "Inquiry sent successfully." });
    }

    if (req.method === "POST" && req.url === "/api/apply-job") {
      const authUser = verifyToken(req);
      if (!authUser) return sendJson(res, 401, { message: "Login required to apply." });
      const body = await readBody(req);
      const application = {
        userId: new ObjectId(authUser.id),
        doctorEmail: authUser.email,
        doctorType: authUser.accountType,
        jobId: cleanText(body.jobId),
        specialty: cleanText(body.specialty),
        hospitalName: cleanText(body.hospitalName),
        location: cleanText(body.location),
        jobType: cleanText(body.jobType),
        message: cleanText(body.message),
        createdAt: new Date()
      };

      await db.collection("applications").insertOne(application);
      return sendJson(res, 201, { message: "Application sent. ST Jupiter team will contact you." });
    }

    if (req.method === "POST" && req.url === "/api/post-job") {
      const body = await readBody(req);
      const job = {
        hospitalName: cleanText(body.hospitalName),
        email: cleanText(body.email).toLowerCase(),
        specialty: cleanText(body.specialty),
        location: cleanText(body.location),
        jobType: cleanText(body.jobType),
        message: cleanText(body.message),
        createdAt: new Date()
      };

      if (!job.hospitalName || !job.email || !job.specialty) {
        return sendJson(res, 400, { message: "Hospital name, email, and specialty are required." });
      }

      await db.collection("jobs").insertOne(job);
      return sendJson(res, 201, { message: "Job posted successfully." });
    }

    if (req.method === "GET" && req.url.startsWith("/api/admin/overview")) {
      const authUser = verifyToken(req);
      if (!isAdmin(authUser)) return sendJson(res, 403, { message: "Admin login required." });
      const options = parseAdminOptions(req.url, 100);
      const query = getAdminQuery(options);
      const sortDirection = options.order === "oldest" ? 1 : -1;

      const [users, jobs, contacts, applications, userCount, jobCount, contactCount, applicationCount] = await Promise.all([
        fetchAdminCollection(db, "users", query, sortDirection, options.limit),
        fetchAdminCollection(db, "jobs", query, sortDirection, options.limit),
        fetchAdminCollection(db, "contacts", query, sortDirection, options.limit),
        fetchAdminCollection(db, "applications", query, sortDirection, options.limit),
        db.collection("users").countDocuments(query),
        db.collection("jobs").countDocuments(query),
        db.collection("contacts").countDocuments(query),
        db.collection("applications").countDocuments(query)
      ]);

      return sendJson(res, 200, {
        stats: {
          users: userCount,
          jobs: jobCount,
          contacts: contactCount,
          applications: applicationCount
        },
        filters: options,
        users,
        jobs,
        contacts,
        applications
      });
    }

    if (req.method === "GET" && req.url.startsWith("/api/admin/export")) {
      const authUser = verifyToken(req);
      if (!isAdmin(authUser)) return sendJson(res, 403, { message: "Admin login required." });

      const options = parseAdminOptions(req.url, 5000);
      const query = getAdminQuery(options);
      const sortDirection = options.order === "oldest" ? 1 : -1;
      const datasetOrder = ["jobs", "applications", "users", "contacts"];
      const selectedDatasets = options.dataset === "all" || !adminExportColumns[options.dataset]
        ? datasetOrder
        : [options.dataset];

      const records = await Promise.all(
        selectedDatasets.map((dataset) => fetchAdminCollection(db, dataset, query, sortDirection, options.limit))
      );

      const sheets = selectedDatasets.map((dataset, index) => {
        const title = dataset.charAt(0).toUpperCase() + dataset.slice(1);
        return worksheetXml(title, adminExportColumns[dataset], records[index]);
      });

      const workbook = buildExcelWorkbook(sheets);
      const filename = `st-jupiter-${options.dataset || "all"}-${Date.now()}.xls`;
      return sendExcel(res, filename, workbook);
    }

    if (req.method === "POST" && req.url === "/api/admin/cleanup-demo") {
      const authUser = verifyToken(req);
      if (!isAdmin(authUser)) return sendJson(res, 403, { message: "Admin login required." });

      const result = await db.collection("jobs").deleteMany({ seeded: true });
      return sendJson(res, 200, {
        message: result.deletedCount
          ? `${result.deletedCount} demo jobs removed.`
          : "No seeded demo jobs found.",
        deletedCount: result.deletedCount
      });
    }

    if (req.method === "POST" && req.url === "/api/admin/delete-job") {
      const authUser = verifyToken(req);
      if (!isAdmin(authUser)) return sendJson(res, 403, { message: "Admin login required." });

      const body = await readBody(req);
      const jobId = cleanText(body.jobId);
      if (!ObjectId.isValid(jobId)) {
        return sendJson(res, 400, { message: "Valid job id is required." });
      }

      const result = await db.collection("jobs").deleteOne({ _id: new ObjectId(jobId) });
      if (!result.deletedCount) {
        return sendJson(res, 404, { message: "Job not found." });
      }

      return sendJson(res, 200, { message: "Job deleted successfully." });
    }

    return sendJson(res, 404, { message: "API route not found." });
  } catch (error) {
    const duplicate = error && error.code === 11000;
    const dbUnavailable = error?.name === "MongoServerSelectionError";
    const tlsIssue = /tlsv1 alert internal error|ssl routines|certificate/i.test(String(error?.message || ""));
    sendJson(res, duplicate ? 409 : 500, {
      message: duplicate
        ? "This email is already registered."
        : tlsIssue
          ? "MongoDB TLS connection failed. Check Node version, Atlas IP allowlist, and hosting SSL support."
          : dbUnavailable
            ? "Database connection failed. Check MongoDB URI and Atlas network access."
          : error.message || "Server error."
    });
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/sitemap.xml") {
    return sendText(res, 200, "application/xml; charset=utf-8", buildSitemap(getBaseUrl(req)));
  }

  if (req.url === "/robots.txt") {
    return sendText(res, 200, "text/plain; charset=utf-8", buildRobots(getBaseUrl(req)));
  }

  if ((req.url || "").startsWith("/api/")) {
    handleApi(req, res);
    return;
  }

  sendFile(req, res);
});

server.listen(port, () => {
  console.log(`ST Jupiter Consultancy website running at http://localhost:${port}`);
  console.log(`Serving: ${root}`);
});
