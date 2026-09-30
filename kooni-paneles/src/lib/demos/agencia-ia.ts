import type { DemoGuion } from "./types";

// Agencia de IA: califica (dolor, urgencia, presupuesto) y cierra una llamada
// de diagnóstico en vez de mandar un PDF genérico.
export const demoAgenciaIa: DemoGuion = {
  es: [
    { de: "cliente", texto: "Hola, ¿hacen automatizaciones para un despacho contable?" },
    { de: "bot", texto: "¡Hola! Soy Kooni, el asistente de Nodo IA 🚀 Sí, automatizamos procesos con IA. Para darte un número aterrizado: ¿qué te está robando más tiempo hoy?" },
    { de: "cliente", texto: "Capturar cotizaciones a mano, son unas 40 al día" },
    { de: "bot", texto: "Te entiendo. Con 40 diarias, una automatización típica te devuelve cerca de 2 horas al día. ¿Lo necesitás este mes o lo estás cotizando para más adelante?" },
    { de: "cliente", texto: "Este mes, si cabe en 40 mil" },
    { de: "bot", texto: "Cabe. Te agendo un diagnóstico de 30 minutos con un especialista: jueves 11:00 o viernes 4:00. ¿Cuál te aparto y a qué correo te mando la propuesta?" },
  ],
  en: [
    { de: "cliente", texto: "Hi, do you build automations for an accounting firm?" },
    { de: "bot", texto: "Hi! I'm Kooni, Nodo IA's assistant 🚀 Yes, we automate processes with AI. So I can give you a real number: what's eating most of your time today?" },
    { de: "cliente", texto: "Typing quotes by hand, about 40 a day" },
    { de: "bot", texto: "I hear you. At 40 a day, a typical automation gives you back close to 2 hours daily. Do you need it this month, or are you pricing it for later?" },
    { de: "cliente", texto: "This month, if it fits in 40k" },
    { de: "bot", texto: "It fits. I'll book a 30-minute diagnostic with a specialist: Thursday 11:00 or Friday 4:00. Which one should I hold, and what email should I send the proposal to?" },
  ],
};
