import type { DemoGuion } from "./types";

// Clínica: agenda con día/hora/motivo, recuerda la cita y respeta el límite —
// no diagnostica: si el síntoma es grave, escala a una persona.
export const demoClinica: DemoGuion = {
  es: [
    { de: "cliente", texto: "Buenas, necesito una cita con el doctor" },
    { de: "bot", texto: "Hola 👋 Soy Kooni, del consultorio del Dr. Ríos. ¿Es tu primera vez o ya eres paciente?" },
    { de: "cliente", texto: "Ya soy paciente, me duele la espalda" },
    { de: "bot", texto: "Gracias. Para el Dr. Ríos tengo jueves 4:30 pm y viernes 10:00 am. ¿Cuál te acomoda?" },
    { de: "cliente", texto: "Jueves" },
    { de: "bot", texto: "Apartada: jueves 4:30 pm con el Dr. Ríos ✅ Te recuerdo el miércoles. Si el dolor empeora o hay hormigueo en las piernas, decime y te paso con la asistente ahora mismo." },
  ],
  en: [
    { de: "cliente", texto: "Hi, I need an appointment with the doctor" },
    { de: "bot", texto: "Hi 👋 I'm Kooni, from Dr. Ríos' practice. Is this your first visit or are you already a patient?" },
    { de: "cliente", texto: "Already a patient, my back hurts" },
    { de: "bot", texto: "Thank you. For Dr. Ríos I have Thursday 4:30 pm and Friday 10:00 am. Which one works for you?" },
    { de: "cliente", texto: "Thursday" },
    { de: "bot", texto: "Booked: Thursday 4:30 pm with Dr. Ríos ✅ I'll remind you on Wednesday. If the pain gets worse or you feel tingling in your legs, tell me and I'll put you through to the assistant right away." },
  ],
};
