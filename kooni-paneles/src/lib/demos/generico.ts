import type { DemoGuion } from "./types";

// Genérico: el momento "wow" es que contesta lo de siempre con datos ciertos y
// pide el contacto para mandar la cotización. Nada de "no sé, preguntá mañana".
export const demoGenerico: DemoGuion = {
  es: [
    { de: "cliente", texto: "Hola, ¿están abiertos?" },
    { de: "bot", texto: "¡Hola! Soy Kooni, el asistente de Taller Ramírez 👋 Sí, hoy hasta las 7 pm. ¿En qué te ayudo?" },
    { de: "cliente", texto: "¿Cuánto sale la afinación?" },
    { de: "bot", texto: "La afinación mayor sale $1,850 e incluye cambio de aceite y filtro. ¿Es para un sedán o para una camioneta?" },
    { de: "cliente", texto: "Sedán, un Jetta 2019" },
    { de: "bot", texto: "Entonces es la mayor: $1,850 y se entrega el mismo día. Te la aparto para esta semana y te confirmo por aquí. ¿Me pasás tu nombre y un número de contacto?" },
  ],
  en: [
    { de: "cliente", texto: "Hi, are you open?" },
    { de: "bot", texto: "Hi! I'm Kooni, Ramírez Auto Shop's assistant 👋 Yes, today until 7 pm. How can I help?" },
    { de: "cliente", texto: "How much is a tune-up?" },
    { de: "bot", texto: "A full tune-up is $1,850 and includes the oil and filter change. Is it for a sedan or a truck?" },
    { de: "cliente", texto: "Sedan, a 2019 Jetta" },
    { de: "bot", texto: "Then it's the full one: $1,850 and it's ready the same day. I can hold a spot this week and confirm here. Can you send me your name and a contact number?" },
  ],
};
