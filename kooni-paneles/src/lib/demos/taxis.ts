import type { DemoGuion } from "./types";

// Taxis: pide la ubicación con referencia, cotiza y despacha la unidad.
export const demoTaxis: DemoGuion = {
  es: [
    { de: "cliente", texto: "¿Me pueden llevar al aeropuerto?" },
    { de: "bot", texto: "🚕 Hola, soy Kooni de Taxi Express. Claro. ¿De dónde te recojo? Pasame calle y una referencia que se vea desde la banqueta." },
    { de: "cliente", texto: "Av. Chapultepec 480, portón azul" },
    { de: "bot", texto: "Anotado. Al aeropuerto son $180 aprox, unos 25 minutos. ¿Te lo confirmo? ¿Pagás en efectivo o por transferencia?" },
    { de: "cliente", texto: "Transferencia" },
    { de: "bot", texto: "Confirmado ✅ Va Luis, unidad 47 (Tsuru blanco, placa 123-ABC). Llega en 8 minutos a tu portón." },
  ],
  en: [
    { de: "cliente", texto: "Can you take me to the airport?" },
    { de: "bot", texto: "🚕 Hi, I'm Kooni from Taxi Express. Sure. Where should I pick you up? Send me the street and a landmark you can see from the sidewalk." },
    { de: "cliente", texto: "480 Chapultepec Ave, blue gate" },
    { de: "bot", texto: "Noted. To the airport it's about $180, roughly 25 minutes. Should I confirm it? Cash or transfer?" },
    { de: "cliente", texto: "Transfer" },
    { de: "bot", texto: "Confirmed ✅ Luis is on the way, unit 47 (white Tsuru, plate 123-ABC). He'll reach your gate in 8 minutes." },
  ],
};
