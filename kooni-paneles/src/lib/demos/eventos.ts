import type { DemoGuion } from "./types";

// Eventos / renta de equipo para fiestas: cotiza el paquete por horas, pregunta
// fecha y zona, y deja la fecha pre-reservada sin prometer disponibilidad.
export const demoEventos: DemoGuion = {
  es: [
    { de: "cliente", texto: "Hola, ¿rentan máquina de fotos para el sábado?" },
    { de: "bot", texto: "🎉 ¡Hola! Sí, soy Kooni de FotoFiesta. La máquina de fotos va por paquetes: 2 h $3,200 y 4 h $4,800, con impresión ilimitada y operador. ¿Qué vas a celebrar?" },
    { de: "cliente", texto: "Los XV de mi hija, en el salón del Centro" },
    { de: "bot", texto: "¡Felicidades! Para el Centro no cobramos traslado. ¿Cuántos invitados esperan y cuántas horas quieren la máquina?" },
    { de: "cliente", texto: "Como 120, y unas 4 horas" },
    { de: "bot", texto: "Con 120 invitados te conviene el paquete de 4 h ($4,800): incluye libro de firmas y la plantilla con el nombre y la fecha. También tenemos el paquete fiesta completo (máquina + audio + luces, 5 h) por $8,900. ¿Te cotizo el de 4 horas?" },
    { de: "cliente", texto: "Sí, el de 4 horas" },
    { de: "bot", texto: "Listo: sábado, máquina de fotos 4 h, salón del Centro, ~120 invitados ✅ Te dejo la fecha PRE-reservada. ¿A qué WhatsApp te mando la cotización para que la confirmen?" },
    { de: "cliente", texto: "33 1234 5678" },
    { de: "bot", texto: "Perfecto. Te manda la cotización una persona del equipo por WhatsApp y, con el anticipo del 50%, la fecha queda apartada. Si necesitás más equipo o cambiás de día, me decís y lo ajustamos 🎈" },
  ],
  en: [
    { de: "cliente", texto: "Hi, do you rent photo booths for Saturday?" },
    { de: "bot", texto: "🎉 Hi! Yes, this is Kooni from FotoFiesta. The photo booth comes in packages: 2 h $3,200 and 4 h $4,800, with unlimited prints and an operator. What's the celebration?" },
    { de: "cliente", texto: "My daughter's quinceañera, at the downtown venue" },
    { de: "bot", texto: "Congratulations! Downtown has no travel fee. How many guests are you expecting, and how many hours do you want the booth?" },
    { de: "cliente", texto: "About 120, and 4 hours" },
    { de: "bot", texto: "For 120 guests the 4 h package fits best ($4,800): it includes a guest book and a custom template with the name and date. We also have the full party package (booth + sound + lights, 5 h) for $8,900. Should I quote the 4-hour one?" },
    { de: "cliente", texto: "Yes, the 4-hour one" },
    { de: "bot", texto: "Done: Saturday, 4 h photo booth, downtown venue, ~120 guests ✅ I'm holding the date as a PRE-booking. Which WhatsApp should I send the quote to so the team can confirm it?" },
    { de: "cliente", texto: "33 1234 5678" },
    { de: "bot", texto: "Perfect. Someone from the team will send the quote over WhatsApp, and the date is locked in with a 50% deposit. If you need more gear or another day, just tell me and we'll adjust 🎈" },
  ],
};
