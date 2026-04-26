const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const dbPath = process.env.RENDER ? '/opt/render/project/stats.db' : 'stats.db';
const db = new Database(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone TEXT NOT NULL,
  plage TEXT NOT NULL,
  correct INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

app.post('/api/report', (req, res) => {
  const { zone, plage, correct } = req.body;
  if (!zone || !plage || correct === undefined) {
    return res.status(400).json({ error: 'Champs requis : zone, plage, correct' });
  }
  db.prepare('INSERT INTO reports (zone, plage, correct) VALUES (?, ?, ?)')
    .run(zone, plage, correct ? 1 : 0);
  res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
  const rows = db.prepare(`
    SELECT zone, plage,
           COUNT(*) as total,
           SUM(correct) as successes,
           (SELECT COUNT(*) FROM reports r2
            WHERE r2.zone = r1.zone AND r2.plage = r1.plage
              AND r2.created_at > datetime('now', '-15 minutes')) as recentDrivers
    FROM reports r1
    GROUP BY zone, plage
  `).all();

  const stats = {};
  rows.forEach(r => {
    const key = `${r.zone}|${r.plage}`;
    stats[key] = {
      total: r.total,
      successes: r.successes,
      recentDrivers: r.recentDrivers
    };
  });
  res.json(stats);
});

app.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`));
