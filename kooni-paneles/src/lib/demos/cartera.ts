import type { DemoGuion } from "./types";

// Cartera de cobros: acá el bot abre la conversación. Monto exacto, promesa de
// pago registrada y salida a una persona si hace falta.
export const demoCartera: DemoGuion = {
  es: [
    { de: "bot", texto: "Hola, Pedro. Te escribe el asistente de Cobranza Atlas. Tenés un saldo vencido de $4,850 con 12 días. ¿El dato es correcto?" },
    { de: "cliente", texto: "Sí, ando mal de dinero. ¿Puedo pagar el viernes?" },
    { de: "bot", texto: "Claro. Te registro entonces una promesa de pago para el viernes por $4,850 y te mando los datos por acá." },
    { de: "cliente", texto: "Va, el viernes pago" },
    { de: "bot", texto: "Gracias, Pedro. Quedó registrado y te recuerdo el jueves. Si querés hablar con una persona o ajustar el monto, decime y te paso ahora." },
  ],
  en: [
    { de: "bot", texto: "Hi, Pedro. This is Cobranza Atlas' assistant. You have an overdue balance of $4,850, now 12 days late. Is that correct?" },
    { de: "cliente", texto: "Yes, money's tight. Can I pay on Friday?" },
    { de: "bot", texto: "Of course. I'll log a payment promise for Friday for $4,850 and send you the payment details here." },
    { de: "cliente", texto: "Deal, I'll pay on Friday" },
    { de: "bot", texto: "Thank you, Pedro. It's logged and I'll remind you on Thursday. If you want to talk to a person or adjust the amount, tell me and I'll put you through." },
  ],
};
