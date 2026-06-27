# 🌷 Mi Diario Parkinson

**Diario por voz para personas con enfermedad de Parkinson.**
Registra tus tomas de medicamento y tus síntomas hablando o con botones grandes, y genera un reporte claro para tu neurólogo.

> Hecho por un paciente, para pacientes. Gratis, abierto y privado.

---

## ✨ Qué hace

- 🎤 **Registro por voz** — di *"tomé la pastilla"*, *"estoy en off"*, *"temblor"* y queda anotado.
- 🟢🟠 **Botones grandes** de respaldo, usables con una sola mano.
- 💊 **Próxima toma** con cuenta regresiva y **recordatorios**.
- 📊 **Reporte de 7 y 30 días** con gráfico y patrón de ***wearing-off*** (cuánto te dura el efecto).
- 📋 **Copiar para el neurólogo** o imprimir en PDF.
- 🤸 **Rutina diaria de ejercicio** para marcar.
- 💾 **Respaldo** de tus datos (exportar / importar).
- 📲 **Instalable** como app (PWA) y **funciona sin internet**.
- 🔒 **100% privado**: tus datos viven solo en tu dispositivo. No hay servidor, no hay cuentas, no hay rastreo.

## ♿ Accesibilidad (primero)

Diseñada pensando en temblor, motricidad fina reducida y voz hipofónica:
botones de 48px o más, alto contraste opcional, texto grande, lectura en voz alta y entrada por voz.

## 🚀 Cómo usarla

1. Ábrela en tu navegador (teléfono o computador).
2. En **Ajustes**, pon tu nombre y los horarios de tus medicamentos.
3. Usa el micrófono o los botones durante el día.
4. En **Reporte**, copia el resumen y mándalo a tu médico.
5. Opcional: *Instalar en mi teléfono* para abrirla como una app.

## 🛠️ Tecnología

HTML, CSS y JavaScript puro. Sin frameworks, sin dependencias, sin build.
- PWA (manifest + service worker) → instalable y offline.
- Web Speech API → reconocimiento de voz en español.
- `localStorage` → datos solo en el dispositivo.

Para correrla localmente:

```bash
# cualquier servidor estático sirve
python -m http.server 8080
# luego abre http://localhost:8080
```

## 🗺️ Próximos pasos

- [ ] Gráfico de horas ON/OFF por día
- [ ] Exportar reporte a PDF con un clic
- [ ] Sincronización opcional cifrada entre dispositivos
- [ ] Versión para que el neurólogo vea tendencias

## ⚠️ Aviso

Esta app es una herramienta de **registro y apoyo**. **No** reemplaza el diagnóstico ni el tratamiento de un profesional de salud. Consulta siempre a tu médico.

## 📄 Licencia

[MIT](LICENSE) — úsala, cópiala y mejórala libremente.
