const fs = require('fs');
const initSqlJs = require('sql.js');
const dbPath = process.env.APPDATA + '/ams-desktop/ams.sqlite';

initSqlJs().then(SQL => {
  if (!fs.existsSync(dbPath)) {
    console.log('DB does not exist at:', dbPath);
    return;
  }
  const filebuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(filebuffer);
  
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables:', JSON.stringify(tables[0]?.values?.flat() || []));

  const migrations = db.exec("SELECT * FROM schema_migrations");
  console.log('Migrations:', JSON.stringify(migrations[0]?.values || []));

  const programmes = db.exec("SELECT * FROM programmes");
  console.log('Programmes:', JSON.stringify(programmes[0]?.values || []));

  const semesters = db.exec("SELECT * FROM semesters");
  console.log('Semesters:', JSON.stringify(semesters[0]?.values || []));

  const subjects = db.exec("SELECT * FROM subjects");
  console.log('Subjects:', JSON.stringify(subjects[0]?.values || []));

  const units = db.exec("SELECT * FROM units");
  console.log('Units:', JSON.stringify(units[0]?.values || []));

  const topics = db.exec("SELECT * FROM topics");
  console.log('Topics:', JSON.stringify(topics[0]?.values || []));
});
