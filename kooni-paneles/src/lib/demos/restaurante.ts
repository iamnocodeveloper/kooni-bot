import type { DemoGuion } from "./types";

// Restaurante: en hora pico el bot reserva (y muestra el menú) sin que nadie
// suelte la cocina.
export const demoRestaurante: DemoGuion = {
  es: [
    { de: "cliente", texto: "¿Tienen mesa para 4 hoy a las 8?" },
    { de: "bot", texto: "¡Hola! Soy Kooni, el asistente de La Cocina de Rana 🍽️ Sí, a las 8 tengo mesa para 4. ¿A nombre de quién la aparto?" },
    { de: "cliente", texto: "De Mariana" },
    { de: "bot", texto: "Listo, Mariana: mesa para 4 hoy a las 8 pm ✅ ¿Querés ver el menú del día?" },
    { de: "cliente", texto: "Sí, ¿qué hay de comer?" },
    { de: "bot", texto: "Hoy: pozole rojo, enchiladas suizas y pescado a la talla. Si alguno del grupo es alérgico a algo, decime y le aviso a la cocina desde ya." },
  ],
  en: [
    { de: "cliente", texto: "Do you have a table for 4 today at 8?" },
    { de: "bot", texto: "Hi! I'm Kooni, La Cocina de Rana's assistant 🍽️ Yes, I have a table for 4 at 8. What name should I put it under?" },
    { de: "cliente", texto: "Mariana" },
    { de: "bot", texto: "Done, Mariana: table for 4 today at 8 pm ✅ Want to see today's menu?" },
    { de: "cliente", texto: "Yes, what's cooking?" },
    { de: "bot", texto: "Today: red pozole, enchiladas suizas and grilled fish. If anyone in your group has an allergy, tell me and I'll let the kitchen know right away." },
  ],
};
