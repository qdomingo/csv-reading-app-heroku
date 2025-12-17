import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { parse } from 'csv-parse';

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Endpoint para subir archivo
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }
  // Guardar también el nombre original para detección de tipo
  res.json({ filename: req.file.filename, originalname: req.file.originalname });
});

// Endpoint para leer archivo subido
app.get('/api/read/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join('uploads', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }
  // Buscar el nombre original del archivo subido
  // Suponemos que el frontend envía el nombre original como query param si es necesario
  const originalname = req.query.originalname || '';
  const ext = path.extname(originalname || filename).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    const workbook = xlsx.readFile(filePath);
    // Buscar la hoja 'O-Licencias', si no existe usar la segunda hoja (índice 1)
    let sheetName = workbook.SheetNames[0];
    for (const name of workbook.SheetNames) {
      if (name.trim().toLowerCase() === 'o-licencias') {
        sheetName = name;
        break;
      }
    }
    // Si no se encontró 'O-Licencias' y hay al menos 2 hojas, usar la segunda
    if (sheetName === workbook.SheetNames[0] && workbook.SheetNames.length > 1) {
      sheetName = workbook.SheetNames[1];
    }
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const normalize = s => (typeof s === 'string' ? s.toLowerCase().replace(/\s|_/g, '') : '');
    // Definir los nombres esperados y sus variantes
    const expected = {
      mail: ['mail'],
      nombre: ['nombrecompleto', 'nombre completo'],
      empresa: ['empresa'],
      licencia: ['licencia'],
      estado: ['estado'],
      fechaAlta: ['fechaalta', 'fecha alta', 'fechadealta', 'fecha de alta'],
      fechaBaja: ['fechabaja', 'fecha baja', 'fechadebaja', 'fecha de baja'],
      proyecto: ['proyecto', 'proyectos']
    };
    // Buscar la fila de cabecera y los índices de cada campo
    let headerRow = null;
    let headerIndex = 0;
    let colIdx = { mail: -1, nombre: -1, empresa: -1, licencia: -1, estado: -1, fechaAlta: -1, fechaBaja: -1, proyecto: -1 };
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i];
      let found = 0;
      row.forEach((cell, idx) => {
        for (const key in expected) {
          if (expected[key].some(e => normalize(cell) === normalize(e))) {
            colIdx[key] = idx;
            found++;
          }
        }
      });
      if (found > 0) {
        headerRow = row;
        headerIndex = i;
        break;
      }
    }
    if (colIdx.mail === -1) {
      console.warn('Excel import: No se encontró la columna Mail. Primeras filas:', rows.slice(0, 10));
      return res.status(400).json({ error: 'No se encontró la columna Mail en el Excel.' });
    }
    // Leer el resto de filas como datos
    const dataRows = rows.slice(headerIndex + 1);
    const normalizedResults = dataRows.map(row => ({
      mail: colIdx.mail !== -1 ? (row[colIdx.mail] || '') : '',
      nombre: colIdx.nombre !== -1 ? (row[colIdx.nombre] || '') : '',
      empresa: colIdx.empresa !== -1 ? (row[colIdx.empresa] || '') : '',
      licencia: colIdx.licencia !== -1 ? (row[colIdx.licencia] || '') : '',
      estado: colIdx.estado !== -1 ? (row[colIdx.estado] || '') : '',
      fechaAlta: colIdx.fechaAlta !== -1 ? (row[colIdx.fechaAlta] || '') : '',
      fechaBaja: colIdx.fechaBaja !== -1 ? (row[colIdx.fechaBaja] || '') : '',
      proyecto: colIdx.proyecto !== -1 ? (row[colIdx.proyecto] || '') : ''
    }));
    return res.json({ type: 'excel', data: normalizedResults });
  } else if (ext === '.csv') {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true }))
      .on('data', (row) => results.push(row))
      .on('end', () => {
        // Mapear columnas relevantes ignorando mayúsculas, espacios y guiones bajos
        const normalize = s => s.toLowerCase().replace(/\s|_/g, '');
        const firstRow = results[0] || {};
        const keys = Object.keys(firstRow);
        // Definir los nombres esperados para ambos tipos de CSV
        const expectedPantalla2 = {
          login: ['login'],
          name: ['name'],
          role: ['role']
        };
        const expectedPantalla1 = {
          login: ['login'],
          lastauthenticatedat: ['lastauthenticatedat', 'last authenticated at'],
          lastactivityat: ['lastactivityat', 'last activity at'],
          lastsurfaceused: ['lastsurfaceused', 'last surface used']
        };
        // Función para mapear columnas
        function getColMap(expected) {
          const colMap = {};
          for (const key of keys) {
            const norm = normalize(key);
            for (const exp in expected) {
              if (expected[exp].some(e => normalize(e) === norm)) {
                colMap[exp] = key;
              }
            }
          }
          // Si falta alguna columna, intentar buscar por coincidencia parcial
          for (const exp in expected) {
            if (!colMap[exp]) {
              const found = keys.find(k => normalize(k).includes(exp));
              if (found) colMap[exp] = found;
            }
          }
          return colMap;
        }
        // Detectar si es un CSV de Pantalla2 (tiene login y role)
        const colMap2 = getColMap(expectedPantalla2);
        const hasPantalla2 = colMap2.login && colMap2.role;
        if (hasPantalla2) {
          // Devolver login, name (si existe) y role
          const normalizedResults = results.map(row => ({
            login: row[colMap2.login] || '',
            name: colMap2.name ? (row[colMap2.name] || '') : '',
            role: row[colMap2.role] || ''
          }));
          return res.json({ type: 'csv', data: normalizedResults });
        }
        // Si no, intentar Pantalla1 (Copilot)
        const colMap1 = getColMap(expectedPantalla1);
        const normalizedResults = results.map(row => ({
          login: row[colMap1.login] || '',
          'last authenticated at': row[colMap1.lastauthenticatedat] || '',
          'last activity at': row[colMap1.lastactivityat] || '',
          'last surface used': row[colMap1.lastsurfaceused] || ''
        }));
        return res.json({ type: 'csv', data: normalizedResults });
      })
      .on('error', (err) => {
        res.status(500).json({ error: 'Error leyendo el archivo CSV' });
      });
  } else {
    res.status(400).json({ error: 'Tipo de archivo no soportado' });
  }
});

// Servir frontend en producción
const __dirname = path.resolve();
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en puerto ${PORT}`);
});
