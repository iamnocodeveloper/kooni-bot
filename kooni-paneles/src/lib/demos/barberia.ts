import type { DemoGuion } from "./types";

// Barbería: precio + duración al instante, agenda por barbero y recordatorio
// para bajar los no-shows.
export const demoBarberia: DemoGuion = {
  es: [
    { de: "cliente", texto: "¿Cuánto está el corte?" },
    { de: "bot", texto: "💈 Hola, soy Kooni de Barbería Norte. Corte $180 (45 min); corte + barba $260. ¿Con quién te atendés y qué día te queda?" },
    { de: "cliente", texto: "Corte con Beto, mañana" },
    { de: "bot", texto: "Beto tiene 12:30 y 5:00 mañana. ¿Cuál te aparto?" },
    { de: "cliente", texto: "A las 5" },
    { de: "bot", texto: "Listo: corte mañana 5:00 pm con Beto ✅ Te recuerdo mañana temprano para que no se te pase, y si vas a llegar tarde con 30 minutos de aviso lo movemos." },
  ],
  en: [
    { de: "cliente", texto: "How much is a haircut?" },
    { de: "bot", texto: "💈 Hi, I'm Kooni from Barbería Norte. Haircut $180 (45 min); haircut + beard $260. Who usually cuts your hair, and which day works?" },
    { de: "cliente", texto: "Haircut with Beto, tomorrow" },
    { de: "bot", texto: "Beto has 12:30 and 5:00 tomorrow. Which one should I hold?" },
    { de: "cliente", texto: "The 5 o'clock" },
    { de: "bot", texto: "Done: haircut tomorrow 5:00 pm with Beto ✅ I'll remind you early tomorrow so you don't miss it, and if you're running late, tell me 30 minutes ahead and we'll move it." },
  ],
};
