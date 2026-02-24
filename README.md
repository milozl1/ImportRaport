# ImportRaport

Aplicatie web (Vite) pentru consolidarea si validarea fisierelor de import.

## Rulare locala

```bash
npm ci
npm run dev
```

## Build productie

```bash
npm run build
```

Build-ul este generat in `dist/`.

## Deploy pe GitHub Pages

1. Urca proiectul pe GitHub.
2. In repository: `Settings -> Pages -> Build and deployment`, selecteaza `GitHub Actions`.
3. Fa push pe branch-ul `main`.
4. Workflow-ul `Deploy to GitHub Pages` va publica automat continutul din `dist`.

Configuratia Vite foloseste `base: './'`, deci aplicatia functioneaza corect si pe subpath-ul GitHub Pages (`https://<user>.github.io/<repo>/`).
