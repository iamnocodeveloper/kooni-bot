import type { DemoGuion } from "./types";

// Inmobiliaria: el guion completo. Saludo → calificación (una cosa a la vez:
// operación, zona, presupuesto, recámaras) → 2 opciones con precio/zona/recámaras
// → propuesta de visita → contacto → cierre con el asesor confirmando.
// Datos de ejemplo (zona, precios, nombre y teléfono): no son reales.
export const demoInmobiliaria: DemoGuion = {
  es: [
    { de: "cliente", texto: "Hola, vi una casa en venta en Providencia. ¿Todavía la tienen?" },
    { de: "bot", texto: "¡Hola! Soy Kooni, el asistente de Casa Norte 👋 Con gusto te ayudo. Primero lo importante: ¿buscás comprar o rentar?" },
    { de: "cliente", texto: "Comprar" },
    { de: "bot", texto: "Perfecto. ¿En qué zona te gustaría vivir? Me sirve una colonia o una alcaldía." },
    { de: "cliente", texto: "Providencia o cerca, me muevo en coche" },
    { de: "bot", texto: "Anotado. ¿Cuánto pensás invertir, más o menos? Así te muestro solo lo que te alcanza." },
    { de: "cliente", texto: "Unos 3.2 millones, hasta 3.5 si vale la pena" },
    { de: "bot", texto: "Va. ¿Cuántas recámaras necesitás como mínimo?" },
    { de: "cliente", texto: "3, y que tenga estacionamiento" },
    { de: "bot", texto: "Con eso ya tengo lo tuyo. Te paso dos que encajan de verdad:" },
    { de: "bot", texto: "🏠 Casa Providencia Norte — 3 recámaras, 2 estacionamientos, 148 m². $3,150,000.\n🏠 Casa San Cristóbal — 3 recámaras, 1 estacionamiento, 132 m². $2,980,000." },
    { de: "bot", texto: "¿Cuál querés ver primero?" },
    { de: "cliente", texto: "La de Providencia" },
    { de: "bot", texto: "Buena elección. Puedo agendarte la visita: ¿te queda mejor entre semana o el sábado?" },
    { de: "cliente", texto: "Sábado por la mañana" },
    { de: "bot", texto: "El sábado tengo 11:00 am libre. ¿Te la aparto? Me pasás tu nombre y un celular para confirmarte." },
    { de: "cliente", texto: "Laura. Te lo dejo aquí: 33 1234 5678" },
    { de: "bot", texto: "Listo, Laura ✅ Te aparté el sábado 11:00 am para ver la casa de Providencia Norte. Un asesor te confirma por acá en un rato." },
  ],
  en: [
    { de: "cliente", texto: "Hi, I saw a house for sale in Providencia. Is it still available?" },
    { de: "bot", texto: "Hi! I'm Kooni, Casa Norte's assistant 👋 Happy to help. First things first: are you looking to buy or rent?" },
    { de: "cliente", texto: "Buy" },
    { de: "bot", texto: "Great. Which area would you like to live in? A neighborhood or a district works." },
    { de: "cliente", texto: "Providencia or nearby, I drive" },
    { de: "bot", texto: "Noted. Roughly how much are you planning to invest? That way I only show you what fits." },
    { de: "cliente", texto: "Around 3.2 million, up to 3.5 if it's worth it" },
    { de: "bot", texto: "Got it. What's the minimum number of bedrooms you need?" },
    { de: "cliente", texto: "3, and it has to have parking" },
    { de: "bot", texto: "That's all I need. Here are two that really fit:" },
    { de: "bot", texto: "🏠 Casa Providencia Norte — 3 bedrooms, 2 parking spots, 148 m². $3,150,000.\n🏠 Casa San Cristóbal — 3 bedrooms, 1 parking spot, 132 m². $2,980,000." },
    { de: "bot", texto: "Which one do you want to see first?" },
    { de: "cliente", texto: "The Providencia one" },
    { de: "bot", texto: "Good choice. I can book the visit: does a weekday or Saturday work better for you?" },
    { de: "cliente", texto: "Saturday morning" },
    { de: "bot", texto: "Saturday 11:00 am is open. Should I hold it? Send me your name and a phone number so I can confirm." },
    { de: "cliente", texto: "Laura. Here it is: 33 1234 5678" },
    { de: "bot", texto: "Done, Laura ✅ I held Saturday 11:00 am to see the Providencia Norte house. An agent will confirm here shortly." },
  ],
};
