const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const QRCode = require("qrcode");
const XLSX = require("xlsx");

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Database setup
const db = new sqlite3.Database("./database.sqlite");
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    attendance INTEGER DEFAULT 0,
    timestamp TEXT
  )`);
});

// Serve pages
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/scanner", (req, res) => res.sendFile(path.join(__dirname, "public", "scanner.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/student/:id", (req, res) => res.sendFile(path.join(__dirname, "public", "student.html")));

// API: Register + Generate QR
app.post("/api/register", async (req, res) => {
  const { id, name, email } = req.body;
  const studentId = id || "ID" + Date.now();

  db.run(
    "INSERT OR REPLACE INTO students (id, name, email, attendance, timestamp) VALUES (?, ?, ?, 0, NULL)",
    [studentId, name, email],
    async (err) => {
      if (err) return res.json({ success: false, message: err.message });

      const qrDataUrl = await QRCode.toDataURL(
        `${req.protocol}://${req.get("host")}/student/${studentId}`
      );
      res.json({ success: true, id: studentId, qrDataUrl });
    }
  );
});

// API: Get student details
app.get("/api/student/:id", (req, res) => {
  db.get("SELECT * FROM students WHERE id=?", [req.params.id], (err, row) => {
    if (err || !row) return res.json({ success: false, message: "Not found" });
    res.json({ success: true, student: row });
  });
});

// API: Mark attendance
app.post("/api/attendance/:id", (req, res) => {
  const timestamp = new Date().toISOString();
  db.get("SELECT attendance FROM students WHERE id=?", [req.params.id], (err, row) => {
    if (err || !row) return res.json({ success: false, message: "Not found" });
    if (row.attendance === 1) {
      return res.json({ success: false, message: "Already marked present" });
    }
    db.run(
      "UPDATE students SET attendance=1, timestamp=? WHERE id=?",
      [timestamp, req.params.id],
      function (err) {
        if (err) return res.json({ success: false, message: err.message });
        res.json({ success: true, timestamp });
      }
    );
  });
});

// API: Get all students
app.get("/api/students", (req, res) => {
  db.all("SELECT * FROM students", (err, rows) => {
    if (err) return res.json({ success: false, message: err.message });
    res.json({ success: true, students: rows });
  });
});

// API: Export Excel
app.get("/api/export", (req, res) => {
  db.all("SELECT * FROM students", (err, rows) => {
    if (err) return res.status(500).send("Error exporting");

    // Format data for Excel
    const data = rows.map(r => ({
      ID: r.id,
      Name: r.name,
      Email: r.email,
      Status: r.attendance ? "Present" : "Absent",
      Timestamp: r.timestamp || ""
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");

    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    res.setHeader("Content-Disposition", "attachment; filename=attendance.xlsx");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  });
});

// Start server
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
