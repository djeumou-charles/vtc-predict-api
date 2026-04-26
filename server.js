const express = require('express');
const cors = require('cors');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const DB_PATH = process.env.RENDER ? '/opt/render/project/stats.db' : path.join(__dirname, 'stats.db');

let db;

// Initialisation de la base de données
async function initDatabase() {
  const SQL = await initSqlJs();
  try {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } catch {
    db = new SQL.Database();
  }
  // Création de la table si elle n'existe pas
  db.run(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone TEXT NOT NULL,
    plage TEXT NOT NULL,
    correct INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  saveDatabase();
}

// Sauvegarde périodique de la base de données sur le disque
function saveDatabase() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Erreur lors de la sauvegarde de la base de données:', err);
  }
}

// POST /api/report
app.post('/api/report', async (req, res) => {
  const { zone, plage, correct } = req.body;
  if (!zone || !plage || correct === undefined) {
    return res.status(400).json({ error: 'Champs requis : zone, plage, correct' });
  }
  try {
    db.run('INSERT INTO reports (zone, plage, correct) VALUES (?, ?, ?)', [zone, plage, correct ? 1 : 0]);
    saveDatabase();
    res.json({ success: true });
  } catch (err) {
    console.error('Erreur POST /api/report:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  try {
    // Récupération des stats agrégées
    const rows = db.exec(`
      SELECT zone, plage, COUNT(*) as total, SUM(correct) as successes
      FROM reports
      GROUP BY zone, plage
    `);
    const recentRows = db.exec(`
      SELECT zone, plage, COUNT(*) as recentDrivers
      FROM reports
      WHERE created_at > datetime('now', '-15 minutes')
      GROUP BY zone, plage
    `);

    const stats = {};
    if (rows.length > 0 && rows[0].values) {
      rows[0].values.forEach(row => {
        const key = `${row[0]}|${row[1]}`;
        stats[key] = { total: row[2], successes: row[3], recentDrivers: 0 };
      });
    }
    if (recentRows.length > 0 && recentRows[0].values) {
      recentRows[0].values.forEach(row => {
        const key = `${row[0]}|${row[1]}`;
        if (stats[key]) {
          stats[key].recentDrivers = row[2];
        } else {
          stats[key] = { total: 0, successes: 0, recentDrivers: row[2] };
        }
      });
    }
    res.json(stats);
  } catch (err) {
    console.error('Erreur GET /api/stats:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Démarrage du serveur
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Serveur démarré sur le port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Erreur lors de l\'initialisation de la base de données:', err);
    process.exit(1);
  });
