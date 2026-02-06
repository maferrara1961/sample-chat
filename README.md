# sample-chat

Ejemplo para un video de YouTube. App web con chat multi-modelo de OpenAI, historial de conversaciones y titulos generados por IA.

![Vista previa](assets/preview.svg)

![Demo (mock)](assets/preview.gif)

## Requisitos

- Node.js 18+
- Variable de entorno `OPENAI_API_KEY`

## Modo demo (sin API key)

Si no hay `OPENAI_API_KEY`, la app pide usuario y password para entrar en modo demo.
Por defecto usa:

- Usuario: `demo`
- Password: `demo`

Puedes cambiarlos con `DEMO_USER` y `DEMO_PASS`.

## Instalacion

```bash
npm install
```

## Ejecucion

```bash
OPENAI_API_KEY=tu_key npm start
```

Abre `http://localhost:10000`.

## Estructura

- `server.js`: API y servidor Express.
- `public/`: frontend estatico.
