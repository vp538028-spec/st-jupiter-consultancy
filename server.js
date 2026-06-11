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

let dbPromise;

const seedJobs = [
  { hospitalName: "New York Heart Center", email: "hr@nyheart.example", specialty: "Cardiologist", location: "New York, USA", jobType: "Full-time", message: "Cardiology OPD and emergency coverage requirement." },
  { hospitalName: "California Surgical Group", email: "hr@casurgery.example", specialty: "Surgeon", location: "California, USA", jobType: "Full-time", message: "General surgeon required for multi-specialty hospital." },
  { hospitalName: "Texas Radiology Network", email: "hr@txradio.example", specialty: "Radiologist", location: "Texas, USA", jobType: "Part-time", message: "MRI, CT, and diagnostic reporting support." },
  { hospitalName: "Florida Medical Center", email: "hr@flmedical.example", specialty: "Physician", location: "Florida, USA", jobType: "Locum", message: "Internal medicine physician for locum coverage." },
  { hospitalName: "Chicago Children's Hospital", email: "hr@chchildren.example", specialty: "Pediatrician", location: "Illinois, USA", jobType: "Full-time", message: "Pediatric OPD and ward round requirement." },
  { hospitalName: "Boston Neuro Care", email: "hr@bostonneuro.example", specialty: "Neurologist", location: "Massachusetts, USA", jobType: "Full-time", message: "Neurology consultant with stroke care experience." },
  { hospitalName: "Seattle Women's Health", email: "hr@seattlewomen.example", specialty: "Gynecologist", location: "Washington, USA", jobType: "Full-time", message: "Gynecology consultant for women care unit." },
  { hospitalName: "Arizona Emergency Care", email: "hr@azemergency.example", specialty: "Emergency Physician", location: "Arizona, USA", jobType: "Contract", message: "Emergency medicine doctor for rotational shifts." }
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
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

async function getDb() {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing");
  }

  if (!dbPromise) {
    const client = new MongoClient(mongoUri);
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

  const seedCount = await db.collection("jobs").countDocuments({ seeded: true });
  if (seedCount === 0) {
    await db.collection("jobs").insertMany(
      seedJobs.map((job) => ({
        ...job,
        seeded: true,
        createdAt: new Date()
      }))
    );
  }
}

function resolveFile(urlPath) {
  const cleanPath = decodeURIComponent((urlPath || "/").split("?")[0]);
  if (cleanPath === "/crm") return path.join(root, "pages", "admin-dashboard.html");
  if (cleanPath === "/crm-login") return path.join(root, "pages", "admin-login.html");
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

function sendFile(req, res) {
  const filePath = resolveFile(req.url);
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>404</h1><p>Page not found.</p>");
      return;
    }

    const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
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
          ? "/pages/admin-dashboard.html"
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
          ? "/pages/admin-dashboard.html"
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

    if (req.method === "GET" && req.url === "/api/admin/overview") {
      const authUser = verifyToken(req);
      if (!isAdmin(authUser)) return sendJson(res, 403, { message: "Admin login required." });

      const [users, jobs, contacts, applications] = await Promise.all([
        db.collection("users").find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).limit(100).toArray(),
        db.collection("jobs").find({}).sort({ createdAt: -1 }).limit(100).toArray(),
        db.collection("contacts").find({}).sort({ createdAt: -1 }).limit(100).toArray(),
        db.collection("applications").find({}).sort({ createdAt: -1 }).limit(100).toArray()
      ]);

      return sendJson(res, 200, {
        stats: {
          users: users.length,
          jobs: jobs.length,
          contacts: contacts.length,
          applications: applications.length
        },
        users,
        jobs,
        contacts,
        applications
      });
    }

    return sendJson(res, 404, { message: "API route not found." });
  } catch (error) {
    const duplicate = error && error.code === 11000;
    sendJson(res, duplicate ? 409 : 500, {
      message: duplicate ? "This email is already registered." : error.message || "Server error."
    });
  }
}

const server = http.createServer((req, res) => {
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
