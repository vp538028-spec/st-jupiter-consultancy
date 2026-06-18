const header = document.querySelector(".site-header");
const menuButton = document.querySelector(".menu-toggle");
const navLinks = document.querySelectorAll(".nav-links a");
const contactForms = document.querySelectorAll(".contact-form");
const authForms = document.querySelectorAll(".auth-card");
const dashboardRoot = document.querySelector("[data-dashboard]");
const hospitalDashboardRoot = document.querySelector("[data-hospital-dashboard]");
const adminRoot = document.querySelector("[data-admin-dashboard]");
const adminReportsRoot = document.querySelector("[data-admin-reports]");
const profilePage = document.querySelector("[data-profile-page]");
const headerActions = document.querySelector(".header-actions");
const doctorDirectoryRoot = document.querySelector("[data-doctor-directory]");

let adminData = { jobs: [], users: [], contacts: [], applications: [] };

const specialties = [
  "All Specialties",
  "Cardiologist",
  "Surgeon",
  "Radiologist",
  "Physician",
  "Pediatrician",
  "Neurologist",
  "Gynecologist",
  "Emergency Physician",
  "Orthopedic",
  "Dermatologist",
  "Anesthesiologist",
  "Psychiatrist",
  "ENT Specialist",
  "Urologist",
  "Nephrologist",
  "Oncologist"
];

const locations = [
  "All Locations",
  "USA",
  "New York, USA",
  "California, USA",
  "Texas, USA",
  "Florida, USA",
  "Illinois, USA",
  "Massachusetts, USA",
  "Washington, USA",
  "Arizona, USA",
  "Delhi NCR",
  "Mumbai",
  "Jaipur",
  "Pune"
];

const jobTypes = ["All Job Types", "Full-time", "Part-time", "Locum", "Contract"];

menuButton?.addEventListener("click", () => {
  const isOpen = header.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    header.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
  });
});

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("stj_user") || "null");
  } catch {
    return null;
  }
}

function logout() {
  const user = getStoredUser();
  localStorage.removeItem("stj_token");
  localStorage.removeItem("stj_user");
  const adminArea = String(user?.accountType || "").toLowerCase() === "admin"
    || location.pathname === "/crm"
    || location.pathname === "/crm-login"
    || location.pathname === "/crm-reports";
  window.location.href = adminArea ? "/crm-login" : "/pages/login.html";
}

function isLoggedIn() {
  return Boolean(localStorage.getItem("stj_token"));
}

function requireLogin(returnTo = location.pathname + location.search) {
  if (isLoggedIn()) return true;
  window.location.href = `/pages/login.html?returnTo=${encodeURIComponent(returnTo)}`;
  return false;
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setFormMessage(form, message, isError = false) {
  let element = form.querySelector(".form-status");
  if (!element) {
    element = document.createElement("p");
    element.className = "form-status";
    form.appendChild(element);
  }
  element.textContent = message;
  element.classList.toggle("error", isError);
}

async function postJson(url, data, token) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(data)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Something went wrong.");
  return payload;
}

async function adminAction(url, token, data = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(data)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Something went wrong.");
  return payload;
}

function renderAuthHeader() {
  if (!headerActions) return;

  const token = localStorage.getItem("stj_token");
  const user = getStoredUser();
  const isAdminAuthPage = location.pathname === "/crm-login" || location.pathname.endsWith("/admin-login.html");
  const isAuthPage = location.pathname.endsWith("/login.html") || location.pathname.endsWith("/register.html") || isAdminAuthPage;
  if (!token || !user || isAuthPage) return;

  const accountType = String(user.accountType || "").toLowerCase();
  const dashboardHref = accountType === "admin"
    ? "/crm"
    : accountType.includes("doctor")
      ? "/pages/doctor-dashboard.html"
      : "/pages/hospital-dashboard.html";

  headerActions.innerHTML = `
    <a class="login-link" href="${dashboardHref}">Dashboard</a>
    <button class="header-call" type="button" data-logout>Logout</button>
  `;

  const nav = document.querySelector(".nav-links");
  if (!nav) return;
  if (accountType.includes("doctor")) {
    nav.innerHTML = `<a href="/">Home</a><a href="/pages/jobs.html">Find Jobs</a><a href="/pages/usa-jobs.html">Quick Jobs</a><a href="/pages/jobs.html">Jobs</a><a href="/pages/contact.html">Support</a>`;
  } else if (accountType.includes("hospital") || accountType.includes("clinic")) {
    nav.innerHTML = `<a href="/">Home</a><a href="/pages/doctors.html">Find Doctors</a><a href="/pages/post-job.html">Recruitment</a><a href="/pages/contact.html">Support</a>`;
  }
}

function fillSelect(select, values) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = values.map((value) => `<option value="${value}">${value}</option>`).join("");
  if (values.includes(current)) select.value = current;
}

function uniqueValues(items, key, fallback) {
  const values = [...new Set(items.map((item) => item[key]).filter(Boolean))].sort();
  return [fallback, ...values];
}

function upgradeJobSearchForms() {
  document.querySelectorAll(".job-search").forEach((form) => {
    fillSelect(form.querySelector('[name="specialty"]'), specialties);

    const locationInput = form.querySelector('[name="location"], input[placeholder="City or state"]');
    if (locationInput && locationInput.tagName !== "SELECT") {
      const select = document.createElement("select");
      select.name = "location";
      locationInput.replaceWith(select);
      fillSelect(select, locations);
    } else {
      fillSelect(locationInput, locations);
    }

    const typeSelect = form.querySelector('[name="jobType"], [name="type"], label:nth-child(3) select');
    if (typeSelect) {
      typeSelect.name = "jobType";
      fillSelect(typeSelect, jobTypes);
    }
  });
}

function renderJobs(container, jobs) {
  if (!container) return;
  container.innerHTML = jobs.length
    ? jobs
        .map((job) => {
          const payload = JSON.stringify({
            jobId: job._id,
            specialty: job.specialty,
            hospitalName: job.hospitalName,
            hospitalEmail: job.email,
            hospitalPhone: job.phone,
            email: job.email,
            phone: job.phone,
            location: job.location,
            jobType: job.jobType,
            message: job.message
          }).replace(/'/g, "&apos;");

          return `
            <article class="job-card">
              <div>
                <p class="job-type">${job.jobType || "Open Role"}</p>
                <h3>${job.specialty || "Doctor Vacancy"}</h3>
                <p>${job.hospitalName || "Hospital"} - ${job.location || "Location flexible"} - ${job.message || "Requirement details available."}</p>
              </div>
              <button class="btn compact" type="button" data-apply-job='${payload}'>Apply Now</button>
            </article>
          `;
        })
        .join("")
    : `<article class="job-card"><div><h3>No matching jobs found</h3><p>Try All Specialties or All Locations, or contact consultant for custom requirement.</p></div><a class="btn compact" href="/pages/contact.html">Contact</a></article>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function profileValue(profile, key, fallback = "Not added") {
  return escapeHtml(profile?.[key] || fallback);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN");
}

function renderProfileSummary(container, user) {
  if (!container) return;
  const profile = user?.profile || {};
  container.innerHTML = `
    <div><strong>Phone</strong><span>${profileValue(profile, "phone")}</span></div>
    <div><strong>Specialty</strong><span>${profileValue(profile, "specialty")}</span></div>
    <div><strong>Location</strong><span>${profileValue(profile, "location")}</span></div>
    <div><strong>Experience</strong><span>${profileValue(profile, "experience")}</span></div>
    <div><strong>Qualification</strong><span>${profileValue(profile, "qualification")}</span></div>
    <div><strong>CV</strong><span>${escapeHtml(user?.assets?.cv?.name || "No CV uploaded")}</span></div>
    <div><strong>Profile Status</strong><span>${user?.profileComplete ? "Complete" : "Pending"}</span></div>
  `;
}

function fillDoctorProfileFields(root, user) {
  if (!root) return;
  const profile = user?.profile || {};
  const fields = {
    "[data-profile-phone]": profile.phone,
    "[data-profile-specialty]": profile.specialty,
    "[data-profile-location]": profile.location,
    "[data-profile-experience]": profile.experience,
    "[data-profile-qualification]": profile.qualification,
    "[data-profile-resume-note]": profile.resumeNote
  };

  Object.entries(fields).forEach(([selector, value]) => {
    const input = root.querySelector(selector);
    if (input) input.value = value || "";
  });
}

function renderDoctorDirectory(container, doctors) {
  if (!container) return;
  container.innerHTML = doctors.length
    ? doctors.map((doctor) => {
        const profile = doctor.profile || {};
        const image = doctor.assets?.profileImage?.dataUrl || "/assets/logo.png";
        const cvLabel = doctor.assets?.cv?.name ? `CV: ${escapeHtml(doctor.assets.cv.name)}` : "CV not uploaded yet";
        return `
          <article class="doctor-card">
            <img class="doctor-avatar" src="${image}" alt="${escapeHtml(doctor.name || "Doctor profile")}" />
            <div class="doctor-card-body">
              <p class="job-type">${profileValue(profile, "specialty", "Doctor")}</p>
              <h3>${escapeHtml(doctor.name || "Doctor Profile")}</h3>
              <div class="doctor-meta">
                <span>${profileValue(profile, "location")}</span>
                <span>${profileValue(profile, "experience")}</span>
                <span>${profileValue(profile, "qualification")}</span>
              </div>
              <p>${profileValue(profile, "resumeNote", "Profile available for hospital recruitment review.")}</p>
              <strong>${cvLabel}</strong>
            </div>
            <a class="btn compact" href="/pages/contact.html">Contact Consultant</a>
          </article>
        `;
      }).join("")
    : `<article class="doctor-card"><div class="doctor-card-body"><h3>No doctor profiles found</h3><p>Filter change karein ya ST Jupiter team ko direct requirement bhejein.</p></div><a class="btn compact" href="/pages/contact.html">Support</a></article>`;
}

async function loadDoctorDirectory() {
  if (!doctorDirectoryRoot) return;

  fillSelect(document.querySelector("[data-doctor-specialty]"), specialties);
  fillSelect(document.querySelector("[data-doctor-location]"), locations);

  const params = new URLSearchParams(location.search);
  const response = await fetch(`/api/doctors?${params.toString()}`);
  const data = await response.json();
  renderDoctorDirectory(doctorDirectoryRoot, data.doctors || []);
}

document.querySelector("[data-doctor-filter]")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formToObject(event.currentTarget);
  const params = new URLSearchParams();
  if (data.q) params.set("q", data.q);
  if (data.specialty) params.set("specialty", data.specialty);
  if (data.location) params.set("location", data.location);
  history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
  await loadDoctorDirectory();
});

async function loadJobs(params = new URLSearchParams(location.search)) {
  const container = document.querySelector("[data-job-results]") || document.querySelector(".jobs .job-grid");
  if (!container) return;

  const response = await fetch(`/api/jobs?${params.toString()}`);
  const data = await response.json();
  renderJobs(container, data.jobs || []);
}

function wireJobSearchForms() {
  document.querySelectorAll(".job-search").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = formToObject(form);
      const params = new URLSearchParams();
      if (data.specialty) params.set("specialty", data.specialty);
      if (data.location) params.set("location", data.location);
      if (data.jobType) params.set("jobType", data.jobType);

      const targetPage = String(data.location || "").toLowerCase().includes("usa") ? "/pages/usa-jobs.html" : "/pages/jobs.html";
      if (!requireLogin(`${targetPage}?${params.toString()}`)) return;

      if (!document.querySelector(".jobs") || location.pathname !== targetPage) {
        window.location.href = `${targetPage}?${params.toString()}`;
        return;
      }

      await loadJobs(params);
      document.querySelector(".jobs")?.scrollIntoView({ behavior: "smooth" });
    });
  });
}

contactForms.forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formToObject(form);
    const isJobPost = "hospitalName" in data || "specialty" in data;
    const url = isJobPost ? "/api/post-job" : "/api/contact";
    const button = form.querySelector("button");

    try {
      button.disabled = true;
      button.textContent = isJobPost ? "Posting..." : "Sending...";
      const result = await postJson(url, data);
      setFormMessage(form, result.message);
      form.reset();
    } catch (error) {
      setFormMessage(form, error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = isJobPost ? "Post a Job" : "Send Inquiry";
    }
  });
});

authForms.forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formToObject(form);
    const isLogin = "loginEmail" in data || "loginPassword" in data;
    const button = form.querySelector("button");
    const payload = isLogin ? { email: data.loginEmail, password: data.loginPassword } : data;

    try {
      button.disabled = true;
      button.textContent = isLogin ? "Logging in..." : "Registering...";
      const result = await postJson(isLogin ? "/api/login" : "/api/register", payload);
      localStorage.setItem("stj_token", result.token);
      localStorage.setItem("stj_user", JSON.stringify(result.user));
      setFormMessage(form, result.message);
      const returnTo = new URLSearchParams(location.search).get("returnTo");
      const adminLogin = location.pathname === "/crm-login" || location.pathname.endsWith("/admin-login.html");
      window.location.href = returnTo || (adminLogin ? "/crm" : result.redirect) || "/pages/doctor-dashboard.html";
    } catch (error) {
      setFormMessage(form, error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = isLogin ? "Login" : "Register";
    }
  });
});

document.addEventListener("click", async (event) => {
  if (event.target.closest("[data-logout]")) {
    logout();
    return;
  }

  const button = event.target.closest("[data-apply-job]");
  if (!button) return;
  if (!requireLogin(location.pathname + location.search)) return;

  try {
    button.disabled = true;
    button.textContent = "Applying...";
    const job = JSON.parse(button.getAttribute("data-apply-job"));
    const result = await postJson("/api/apply-job", job, localStorage.getItem("stj_token"));
    button.textContent = "Applied";
    alert(result.message);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Apply Now";
    alert(error.message);
  }
});

async function loadDashboard() {
  if (!dashboardRoot) return;

  const token = localStorage.getItem("stj_token");
  if (!token) {
    window.location.href = "/pages/login.html";
    return;
  }

  try {
    const response = await fetch("/api/dashboard", { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Please login again.");
    if (!data.user?.profileComplete && String(data.user?.accountType || "").toLowerCase() !== "admin") {
      window.location.href = "/pages/complete-profile.html";
      return;
    }

    dashboardRoot.querySelector("[data-user-name]").textContent = data.user?.name || "Doctor";
    dashboardRoot.querySelector("[data-user-email]").textContent = data.user?.email || "";
    dashboardRoot.querySelector("[data-user-type]").textContent = data.user?.accountType || "Doctor";
    if (data.user?.assets?.profileImage?.dataUrl) {
      dashboardRoot.querySelectorAll("[data-profile-preview]").forEach((img) => {
        img.src = data.user.assets.profileImage.dataUrl;
      });
    }
    if (data.user?.assets?.cv?.name && dashboardRoot.querySelector("[data-cv-status]")) {
      dashboardRoot.querySelector("[data-cv-status]").value = data.user.assets.cv.name;
    }
    fillDoctorProfileFields(dashboardRoot, data.user);
    renderProfileSummary(dashboardRoot.querySelector("[data-profile-summary]"), data.user);
    renderJobs(dashboardRoot.querySelector("[data-dashboard-jobs]"), data.jobs || []);
    renderAppliedJobs(dashboardRoot.querySelector("[data-applied-jobs]"), data.applications || []);
  } catch (error) {
    localStorage.removeItem("stj_token");
    dashboardRoot.innerHTML = `<section class="page-hero"><p>${error.message}</p><a class="btn primary" href="/pages/login.html">Login Again</a></section>`;
  }
}

function renderAppliedJobs(container, applications) {
  if (!container) return;
  container.innerHTML = applications.length
    ? applications.map((application) => `
        <article class="job-card">
          <div>
            <p class="job-type">Applied</p>
            <h3>${application.specialty || "Doctor Vacancy"}</h3>
            <p>${application.hospitalName || "Hospital"} - ${application.location || "Location"} - ${application.jobType || "Job Type"}</p>
          </div>
          <span class="btn secondary">Applied</span>
        </article>
      `).join("")
    : `<article class="job-card"><div><h3>No applications yet</h3><p>Apply Now click karne ke baad jobs yahan show hongi.</p></div><a class="btn compact" href="/pages/jobs.html">Find Jobs</a></article>`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function saveProfileAsset(kind, file) {
  const token = localStorage.getItem("stj_token");
  if (!token || !file) return null;
  const dataUrl = await fileToDataUrl(file);
  return postJson("/api/profile-assets", { kind, name: file.name, type: file.type, dataUrl }, token);
}

document.querySelector("[data-save-profile-assets]")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const file = document.querySelector("[data-profile-image]")?.files?.[0];
  try {
    button.disabled = true;
    button.textContent = "Saving...";
    await postJson("/api/profile", {
      phone: document.querySelector("[data-profile-phone]")?.value || "",
      specialty: document.querySelector("[data-profile-specialty]")?.value || "",
      location: document.querySelector("[data-profile-location]")?.value || "",
      experience: document.querySelector("[data-profile-experience]")?.value || "",
      qualification: document.querySelector("[data-profile-qualification]")?.value || "",
      resumeNote: document.querySelector("[data-profile-resume-note]")?.value || ""
    }, localStorage.getItem("stj_token"));
    if (file) {
      const result = await saveProfileAsset("profileImage", file);
      if (result?.asset?.dataUrl) {
        document.querySelectorAll("[data-profile-preview]").forEach((img) => {
          img.src = result.asset.dataUrl;
        });
      }
    }
    alert("Profile updated.");
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Save Profile";
  }
});

document.querySelector("[data-upload-cv]")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const file = document.querySelector("[data-cv-file]")?.files?.[0];
  if (!file) {
    alert("Please choose CV file first.");
    return;
  }
  try {
    button.disabled = true;
    button.textContent = "Uploading...";
    const result = await saveProfileAsset("cv", file);
    const status = document.querySelector("[data-cv-status]");
    if (status) status.value = result.asset?.name || file.name;
    alert("CV uploaded.");
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Upload CV";
  }
});

document.querySelectorAll("[data-chat-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = form.querySelector("input");
    const chatBox = document.querySelector("[data-chat-box]") || form.previousElementSibling;
    if (chatBox && input.value.trim()) {
      chatBox.insertAdjacentHTML("beforeend", `<p><strong>You:</strong> ${input.value.trim()}</p><p><strong>Support:</strong> Message received. Team update share karegi.</p>`);
    }
    form.reset();
  });
});

async function loadHospitalDashboard() {
  if (!hospitalDashboardRoot) return;

  const token = localStorage.getItem("stj_token");
  if (!token) {
    window.location.href = "/pages/login.html";
    return;
  }

  try {
    const response = await fetch("/api/dashboard", { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Please login again.");
    if (!data.user?.profileComplete) {
      window.location.href = "/pages/complete-profile.html";
      return;
    }

    hospitalDashboardRoot.querySelector("[data-hospital-email]").textContent = data.user?.email || "";
    hospitalDashboardRoot.querySelector("[data-hospital-post-count]").textContent = data.postedJobs?.length || 0;
    hospitalDashboardRoot.querySelector("[data-hospital-active-count]").textContent = data.postedJobs?.length || 0;
    const profile = data.user?.profile || {};
    hospitalDashboardRoot.querySelector("[data-hospital-name]").textContent = profile.hospitalName || data.user?.name || "Hospital Panel";
    const hospitalProfile = hospitalDashboardRoot.querySelector("[data-hospital-profile]");
    if (hospitalProfile) {
      hospitalProfile.innerHTML = `
        <div><strong>Hospital</strong><span>${escapeHtml(profile.hospitalName || data.user?.name || "Not added")}</span></div>
        <div><strong>Phone</strong><span>${escapeHtml(profile.phone || "Not added")}</span></div>
        <div><strong>Location</strong><span>${escapeHtml(profile.location || "Not added")}</span></div>
        <div><strong>Contact Person</strong><span>${escapeHtml(profile.contactPerson || "Not added")}</span></div>
        <div><strong>Hiring Needs</strong><span>${escapeHtml(profile.hiringNeeds || "Not added")}</span></div>
      `;
    }
    renderJobs(hospitalDashboardRoot.querySelector("[data-hospital-jobs]"), data.postedJobs || []);
  } catch (error) {
    hospitalDashboardRoot.innerHTML = `<section class="page-hero"><p>${error.message}</p><a class="btn primary" href="/pages/login.html">Login Again</a></section>`;
  }
}

async function setupProfilePage() {
  if (!profilePage) return;
  const token = localStorage.getItem("stj_token");
  if (!token) {
    window.location.href = "/pages/login.html";
    return;
  }

  const response = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) {
    window.location.href = "/pages/login.html";
    return;
  }

  const accountType = String(data.user?.accountType || "");
  const isDoctor = accountType.toLowerCase().includes("doctor");
  profilePage.querySelector("[data-profile-title]").textContent = isDoctor ? "Doctor Details" : "Hospital Details";
  profilePage.querySelector("[data-doctor-fields]").hidden = !isDoctor;
  profilePage.querySelector("[data-hospital-fields]").hidden = isDoctor;

  profilePage.querySelector("[data-profile-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");

    try {
      button.disabled = true;
      button.textContent = "Saving...";
      const result = await postJson("/api/profile", formToObject(form), token);
      const storedUser = getStoredUser() || {};
      storedUser.profileComplete = true;
      localStorage.setItem("stj_user", JSON.stringify(storedUser));
      window.location.href = result.redirect;
    } catch (error) {
      setFormMessage(form, error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Save & Continue";
    }
  });
}

async function loadAdminDashboard() {
  if (!adminRoot) return;

  const token = localStorage.getItem("stj_token");
  if (!token) {
    window.location.href = "/crm-login";
    return;
  }

  try {
    const response = await fetch("/api/admin/overview", { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Admin login required.");

    adminData = data;
    adminRoot.querySelector("[data-stat-users]").textContent = data.stats.users;
    adminRoot.querySelector("[data-stat-jobs]").textContent = data.stats.jobs;
    adminRoot.querySelector("[data-stat-contacts]").textContent = data.stats.contacts;
    adminRoot.querySelector("[data-stat-applications]").textContent = data.stats.applications;
    fillSelect(adminRoot.querySelector('[data-job-filter="specialty"]'), uniqueValues(data.jobs, "specialty", "All Specialties"));
    fillSelect(adminRoot.querySelector('[data-job-filter="location"]'), uniqueValues(data.jobs, "location", "All Locations"));
    fillSelect(adminRoot.querySelector('[data-job-filter="jobType"]'), uniqueValues(data.jobs, "jobType", "All Job Types"));
    renderAdminTables();
  } catch (error) {
    adminRoot.innerHTML = `<section class="page-hero"><p>${error.message}</p><a class="btn primary" href="/crm-login">Admin Login</a></section>`;
  }
}

function matchesSearch(item, term) {
  if (!term) return true;
  return Object.values(item).join(" ").toLowerCase().includes(term.toLowerCase());
}

function renderAdminTables() {
  if (!adminRoot) return;

  const jobsTerm = adminRoot.querySelector('[data-table-filter="jobs"]')?.value || "";
  const usersTerm = adminRoot.querySelector('[data-table-filter="users"]')?.value || "";
  const contactsTerm = adminRoot.querySelector('[data-table-filter="contacts"]')?.value || "";
  const applicationsTerm = adminRoot.querySelector('[data-table-filter="applications"]')?.value || "";
  const specialty = adminRoot.querySelector('[data-job-filter="specialty"]')?.value || "All Specialties";
  const locationValue = adminRoot.querySelector('[data-job-filter="location"]')?.value || "All Locations";
  const jobType = adminRoot.querySelector('[data-job-filter="jobType"]')?.value || "All Job Types";

  const jobs = adminData.jobs.filter((job) => {
    return matchesSearch(job, jobsTerm)
      && (specialty === "All Specialties" || job.specialty === specialty)
      && (locationValue === "All Locations" || job.location === locationValue)
      && (jobType === "All Job Types" || job.jobType === jobType);
  });
  const users = adminData.users.filter((user) => matchesSearch(user, usersTerm));
  const contacts = adminData.contacts.filter((contact) => matchesSearch(contact, contactsTerm));
  const applications = adminData.applications.filter((application) => matchesSearch(application, applicationsTerm));

  adminRoot.querySelector("[data-admin-jobs]").innerHTML = jobs.map((job) => `<tr><td>${job.hospitalName || ""}</td><td>${job.phone || ""}</td><td>${job.email || ""}</td><td>${job.specialty || ""}</td><td>${job.location || ""}</td><td>${job.jobType || ""}</td><td><button class="btn compact" type="button" data-admin-job-delete="${job._id}">Delete</button></td></tr>`).join("");
  adminRoot.querySelector("[data-admin-users]").innerHTML = users.map((user) => {
    const profile = user.profile || {};
    return `<tr><td>${user.name || ""}</td><td>${profile.phone || ""}</td><td>${user.email || ""}</td><td>${user.accountType || ""}</td><td>${profile.specialty || profile.hospitalName || ""}</td><td>${profile.location || ""}</td></tr>`;
  }).join("");
  adminRoot.querySelector("[data-admin-contacts]").innerHTML = contacts.map((contact) => `<tr><td>${contact.name || ""}</td><td>${contact.phone || ""}</td><td>${contact.role || ""}</td><td>${contact.message || ""}</td></tr>`).join("");
  adminRoot.querySelector("[data-admin-applications]").innerHTML = applications.map((application) => `<tr><td>${application.doctorName || ""}</td><td>${application.doctorPhone || ""}</td><td>${application.doctorEmail || ""}</td><td>${application.specialty || application.doctorSpecialty || ""}</td><td>${application.doctorExperience || ""}</td><td>${application.doctorCvFile || ""}</td><td>${application.hospitalName || ""}</td><td>${application.jobType || ""}</td></tr>`).join("");
}

function getReportParams(limit = 200) {
  const params = new URLSearchParams();
  const form = adminReportsRoot?.querySelector("[data-report-form]");
  const formData = form ? formToObject(form) : {};

  params.set("dataset", formData.dataset || "all");
  params.set("range", formData.range || "all");
  params.set("order", formData.order || "newest");
  params.set("limit", String(limit));

  if (formData.from) params.set("from", formData.from);
  if (formData.to) params.set("to", formData.to);
  return params;
}

function toggleReportSections(dataset) {
  if (!adminReportsRoot) return;
  adminReportsRoot.querySelectorAll("[data-report-section]").forEach((section) => {
    section.hidden = dataset !== "all" && section.getAttribute("data-report-section") !== dataset;
  });
}

function syncReportDateFields() {
  if (!adminReportsRoot) return;
  const isCustom = adminReportsRoot.querySelector("[data-report-range]")?.value === "custom";
  adminReportsRoot.querySelectorAll("[data-report-from], [data-report-to]").forEach((input) => {
    input.disabled = !isCustom;
  });
}

function renderReportRows(container, rows, type) {
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = `<tr><td colspan="5">No data found for selected filters.</td></tr>`;
    return;
  }

  if (type === "jobs") {
    container.innerHTML = rows.map((job) => `<tr><td>${job.specialty || ""}</td><td>${job.location || ""}</td><td>${job.jobType || ""}</td><td>${job.hospitalName || ""}</td><td>${formatDate(job.createdAt)}</td></tr>`).join("");
  }

  if (type === "applications") {
    container.innerHTML = rows.map((application) => `<tr><td>${application.doctorEmail || ""}</td><td>${application.specialty || ""}</td><td>${application.location || ""}</td><td>${application.hospitalName || ""}</td><td>${formatDate(application.createdAt)}</td></tr>`).join("");
  }

  if (type === "users") {
    container.innerHTML = rows.map((user) => `<tr><td>${user.name || ""}</td><td>${user.email || ""}</td><td>${user.accountType || ""}</td><td>${formatDate(user.createdAt)}</td></tr>`).join("");
  }

  if (type === "contacts") {
    container.innerHTML = rows.map((contact) => `<tr><td>${contact.name || ""}</td><td>${contact.phone || ""}</td><td>${contact.role || ""}</td><td>${formatDate(contact.createdAt)}</td></tr>`).join("");
  }
}

async function downloadAdminExport(dataset) {
  const token = localStorage.getItem("stj_token");
  if (!token) {
    window.location.href = "/crm-login";
    return;
  }

  const params = adminReportsRoot ? getReportParams(5000) : new URLSearchParams({ dataset: dataset || "all", range: "all", order: "newest", limit: "5000" });
  if (dataset) params.set("dataset", dataset);

  const response = await fetch(`/api/admin/export?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Export failed.");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || `st-jupiter-${dataset || "all"}.xls`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function loadAdminReports() {
  if (!adminReportsRoot) return;

  const token = localStorage.getItem("stj_token");
  if (!token) {
    window.location.href = "/crm-login";
    return;
  }

  try {
    syncReportDateFields();
    const params = getReportParams(200);
    const response = await fetch(`/api/admin/overview?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Admin login required.");

    adminReportsRoot.querySelector("[data-report-users-count]").textContent = data.stats.users || 0;
    adminReportsRoot.querySelector("[data-report-jobs-count]").textContent = data.stats.jobs || 0;
    adminReportsRoot.querySelector("[data-report-contacts-count]").textContent = data.stats.contacts || 0;
    adminReportsRoot.querySelector("[data-report-applications-count]").textContent = data.stats.applications || 0;

    renderReportRows(adminReportsRoot.querySelector("[data-report-jobs]"), data.jobs || [], "jobs");
    renderReportRows(adminReportsRoot.querySelector("[data-report-applications]"), data.applications || [], "applications");
    renderReportRows(adminReportsRoot.querySelector("[data-report-users]"), data.users || [], "users");
    renderReportRows(adminReportsRoot.querySelector("[data-report-contacts]"), data.contacts || [], "contacts");
    toggleReportSections(params.get("dataset") || "all");
  } catch (error) {
    adminReportsRoot.innerHTML = `<section class="page-hero"><p>${error.message}</p><a class="btn primary" href="/crm-login">Admin Login</a></section>`;
  }
}

adminRoot?.addEventListener("input", (event) => {
  if (event.target.matches("[data-table-filter]")) renderAdminTables();
});

adminRoot?.addEventListener("change", (event) => {
  if (event.target.matches("[data-job-filter]")) renderAdminTables();
});

adminRoot?.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("[data-admin-action]");
  if (actionButton?.getAttribute("data-admin-action") === "cleanup-demo") {
    try {
      const result = await adminAction("/api/admin/cleanup-demo", localStorage.getItem("stj_token"));
      alert(result.message);
      await loadAdminDashboard();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  const deleteButton = event.target.closest("[data-admin-job-delete]");
  if (deleteButton) {
    try {
      const result = await adminAction("/api/admin/delete-job", localStorage.getItem("stj_token"), {
        jobId: deleteButton.getAttribute("data-admin-job-delete")
      });
      alert(result.message);
      await loadAdminDashboard();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  const button = event.target.closest("[data-export-type]");
  if (!button) return;
  try {
    await downloadAdminExport(button.getAttribute("data-export-type"));
  } catch (error) {
    alert(error.message);
  }
});

adminReportsRoot?.querySelector("[data-report-form]")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadAdminReports();
});

adminReportsRoot?.addEventListener("change", async (event) => {
  if (event.target.matches("[data-report-range]")) {
    syncReportDateFields();
  }

  if (event.target.matches("[data-report-dataset]")) {
    toggleReportSections(event.target.value);
  }
});

adminReportsRoot?.addEventListener("click", async (event) => {
  const currentButton = event.target.closest("[data-export-current]");
  if (currentButton) {
    try {
      await downloadAdminExport(adminReportsRoot.querySelector("[data-report-dataset]")?.value || "all");
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  const exportButton = event.target.closest("[data-export-type]");
  if (!exportButton) return;
  try {
    await downloadAdminExport(exportButton.getAttribute("data-export-type"));
  } catch (error) {
    alert(error.message);
  }
});

renderAuthHeader();
upgradeJobSearchForms();
wireJobSearchForms();
loadJobs();
loadDashboard();
loadHospitalDashboard();
setupProfilePage();
loadAdminDashboard();
loadAdminReports();
loadDoctorDirectory();
