# 💃 El Parche de Cali

Chat en vivo para los caleños y caleñas. **La sucursal del cielo en línea.**

Entra con tu apodo, elige sala (#Cali, #Salsa, #Rumba, #Colombia) y charla en
tiempo real: salsa, rumba, amor y buena vibra. Sin registro, gratis y anónimo.

## 🚀 Cómo funciona

- **Frontend**: `public/` — página de entrada y sala de chat (HTML/CSS/JS puro).
- **Backend**: `server/server.js` — Node.js + WebSocket (`ws`) para mensajería
  instantánea por salas.
- El servidor sirve el frontend y maneja `/ws` al mismo tiempo.

## ▶️ Correr localmente

```bash
npm install
npm start
```

Abre http://localhost:3000, escribe un apodo y chatea. Para probar con dos
navegadores (o una ventana normal + una de incógnito), abre dos pestañas.

Prueba automatizada:

```bash
node test-parche.js   # requiere el servidor corriendo
```

## ☁️ Subirlo gratis a Internet (Render)

1. Ve a https://render.com → **New** → **Web Service**.
2. Conecta tu repositorio `leounpa/caliescali-chat`.
3. Render detecta `render.yaml` automáticamente (Build: `npm install`,
   Start: `npm start`). Dale **Create Web Service**.
4. Queda en línea en una URL tipo `https://el-parche-de-cali.onrender.com`.
   Gratis (el servicio se duerme si nadie entra y despierta solo).

## 🧪 Probar en línea antes de entrar

Si solo abres el frontend en GitHub Pages (estático), la sala necesita el
servidor. Define la URL del WebSocket creando `public/config.js`:

```js
window.PARCHE_CONFIG = { wsUrl: "wss://el-parche-de-cali.onrender.com/ws" };
```

## 🏆 Sistema de Roles y Rangos

El chat tiene un sistema automático de rangos que recompensa el buen comportamiento:

| Rango | Puntos | Badge | Descripción |
|-------|--------|-------|-------------|
| 🌱 Nuevo | 0 | `badge-nuevo` | Usuarios nuevos |
| ✅ Activo | 10+ | `badge-activo` | Participación regular |
| 🏅 Veterano | 50+ | `badge-veterano` | Miembros constantes |
| ⭐ Leyenda | 200+ | `badge-leyenda` | Los más dedicados |

**Cómo ganar puntos:**
- +1 punto por cada mensaje enviado
- +3 puntos cada 5 minutos conectado (bonus por tiempo)
- +2 puntos extra por usar lenguaje respetuoso (palabras como "gracias", "buenas", "excelente")

**Moderación automática:**
- Filtro de palabras ofensivas con sistema de expulsiones progresivas
- Detección de spam y promociones
- Los moderadores pueden expulsar, silenciar y banear usuarios

## 📱 Versión Móvil

El sitio está optimizado para dispositivos móviles con:
- Diseño responsive completo
- Menú hamburguesa para navegación
- Panel de usuarios deslizante
- Badges de roles visibles en chat
- Formulario adaptado a pantallas pequeñas

## 📁 Estructura

```
el-parche-de-cali/
├── index.html       # entrada: apodo + sala
├── chat.html        # sala de chat
├── terminos.html    # términos y condiciones
├── css/
│   └── estilo.css   # estilos responsivos
├── js/
│   └── chat.js      # cliente WebSocket
├── img/
│   ├── logo.svg         # logo principal (bandera de Cali)
│   ├── logo-header.svg  # logo para header del chat
│   ├── icono.svg        # icono compacto
│   └── favicon.svg      # favicon del navegador
├── server/
│   ├── server.js    # servidor HTTP + WebSocket
│   └── roles.json   # datos de puntos/rangos (auto-generado)
├── package.json
├── render.yaml
└── test-parche.js
```

## 🛡️ Normas

Sala pública y gratuita. Respeta a los demás, no compartas datos personales de
terceros, nada de acoso ni spam. ¡Disfruta el Parche!

© 2026 El Parche de Cali · Hecho con 💛💚❤️ para los caleños
