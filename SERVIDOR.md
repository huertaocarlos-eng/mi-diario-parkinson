# Despliegue en servidor propio (hermes)

La app se hospeda en el servidor Ubuntu de Carlos y se expone por HTTPS con Cloudflare Tunnel.
El backend Node sirve la PWA y envía las notificaciones push a la hora exacta.

## Datos
- Servidor: `hermes@192.168.1.43` (Ubuntu 26.04, Node v22)
- Carpeta: `~/diario/` (backend) + `~/diario/public/` (PWA)
- Puerto backend: **8642** (el 8080 lo usa otra app)
- Servicios systemd: `diario.service` (Node) y `diario-tunnel.service` (cloudflared)
- URL pública (EFÍMERA, quick tunnel): cambia si el túnel reinicia

## Comandos útiles (en el servidor)
```bash
# estado
systemctl status diario.service
systemctl status diario-tunnel.service

# ver la URL pública actual
sudo journalctl -u diario-tunnel.service --no-pager | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1

# reiniciar
sudo systemctl restart diario.service
sudo systemctl restart diario-tunnel.service

# salud / VAPID
curl localhost:8642/api/health
curl localhost:8642/api/vapidPublicKey
```

## Actualizar la app (desde el PC)
```bash
scp index.html sw.js manifest.webmanifest hermes@192.168.1.43:diario/public/
scp -r css js icons hermes@192.168.1.43:diario/public/
scp server/server.js hermes@192.168.1.43:diario/
# si cambió server.js:
ssh hermes@192.168.1.43 "sudo systemctl restart diario.service"
```

## Pendiente: URL permanente
El quick tunnel da una URL que cambia al reiniciar. Para una URL fija:
- Opción A: cuenta Cloudflare gratis + named tunnel (`cloudflared tunnel login` → crear túnel con nombre → ruta a un subdominio).
- Opción B: dominio propio apuntando al servidor + Let's Encrypt + nginx.
Cuando se haga, actualizar el acceso directo del teléfono a la URL nueva.

## Seguridad
- Rotar la clave del usuario `hermes` (se compartió en texto plano). Idealmente entrar con llave SSH.
- `vapid.json` y `data.json` no deben subirse a git (contienen la clave del servidor push y las suscripciones).
