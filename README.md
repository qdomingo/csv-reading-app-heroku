# CSVReadingHeroku

Este proyecto es una aplicación Node.js diseñada para leer archivos CSV y desplegarse en Heroku.

## Estructura del proyecto

- `index.js`: Archivo principal de la aplicación.
- `package.json`: Dependencias y scripts del proyecto.
- `Procfile`: Archivo de configuración para Heroku.
- `build/`: Archivos estáticos generados para producción.
- `uploads/`: Carpeta donde se almacenan los archivos CSV subidos.

## Instalación

1. Clona este repositorio:
   ```bash
   git clone <url-del-repositorio>
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```

## Uso local

Ejecuta la aplicación localmente:
```bash
node index.js
```

## Despliegue en Heroku

1. Inicia sesión en Heroku y crea una app:
   ```bash
   heroku login
   heroku create nombre-de-tu-app
   ```
2. Sube el código y despliega:
   ```bash
   git add .
   git commit -m "Deploy to Heroku"
   git push heroku main
   ```

## Notas
- Los archivos subidos se almacenan en la carpeta `uploads/`.
- Asegúrate de que el archivo `Procfile` esté presente para el despliegue en Heroku.

## Licencia

MIT
