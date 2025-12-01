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
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    return res.json({ type: 'excel', data });
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
