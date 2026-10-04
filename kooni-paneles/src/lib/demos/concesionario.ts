import type { DemoGuion } from "./types";

// Concesionario / venta de autos: busca en el inventario real, manda la ficha,
// califica (presupuesto, financiamiento, auto a cuenta) y agenda la prueba de
// manejo sin prometer crédito ni valuar el auto del cliente.
export const demoConcesionario: DemoGuion = {
  es: [
    { de: "cliente", texto: "Hola, ¿tienen alguna SUV usada de menos de 30 mil?" },
    { de: "bot", texto: "🚗 ¡Hola! Soy Kooni de AutoMax. Déjame revisar el inventario. ¿Algún modelo en mente, o te muestro lo que haya?" },
    { de: "cliente", texto: "Lo que haya, para la familia" },
    { de: "bot", texto: "En el inventario de hoy tengo 2 que encajan: 2022 Kia Sorento SX · usado · 41,200 millas · $28,500, y 2021 Toyota RAV4 LE · usado · 36,800 millas · $27,900. ¿Te mando la ficha con foto de alguna?" },
    { de: "cliente", texto: "La Sorento. ¿Se puede financiar?" },
    { de: "bot", texto: "Te mando la ficha de la Sorento 📸 Sí trabajamos con financiamiento, pero la aprobación, la tasa y la mensualidad las calcula un asesor con tus datos; yo no te puedo prometer nada. ¿Tienes un auto para dejar a cuenta?" },
    { de: "cliente", texto: "Sí, un Civic 2016" },
    { de: "bot", texto: "Perfecto, el asesor lo valúa en persona. ¿Te gustaría probar la Sorento? Tengo el jueves a las 11:00 y a las 16:00." },
    { de: "cliente", texto: "El jueves a las 16:00. Soy Marcos, 305 555 0142" },
    { de: "bot", texto: "Listo, Marcos ✅ Prueba de manejo de la Sorento el jueves a las 16:00. Lleva tu licencia. Un asesor te escribe a ese WhatsApp para confirmar y ver el financiamiento y tu Civic. 🙌" },
  ],
  en: [
    { de: "cliente", texto: "Hi, do you have a used SUV under 30k?" },
    { de: "bot", texto: "🚗 Hi! This is Kooni from AutoMax. Let me check the inventory. Any model in mind, or should I show you what's there?" },
    { de: "cliente", texto: "Whatever you have, for the family" },
    { de: "bot", texto: "In today's inventory I have 2 that fit: a 2022 Kia Sorento SX · used · 41,200 miles · $28,500, and a 2021 Toyota RAV4 LE · used · 36,800 miles · $27,900. Want the listing with photos for either?" },
    { de: "cliente", texto: "The Sorento. Can it be financed?" },
    { de: "bot", texto: "Sending the Sorento listing 📸 Yes, we offer financing, but approval, rate and monthly payment are calculated by an advisor with your details; I can't promise anything. Do you have a trade-in?" },
    { de: "cliente", texto: "Yes, a 2016 Civic" },
    { de: "bot", texto: "Great, the advisor appraises it in person. Would you like to test drive the Sorento? I have Thursday at 11:00 and 16:00." },
    { de: "cliente", texto: "Thursday at 16:00. I'm Marcos, 305 555 0142" },
    { de: "bot", texto: "Done, Marcos ✅ Sorento test drive on Thursday at 16:00. Bring your license. An advisor will text that WhatsApp to confirm and go over financing and your Civic. 🙌" },
  ],
};
