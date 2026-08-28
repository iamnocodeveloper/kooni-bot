import { Db } from "./client";
import { stripSpecialCharacters } from "../utils/keyword-matcher";

/**
 * Dedup por huella de comentario (post + autor + texto normalizado).
 *
 * Por qué existe: Zernio a veces reentrega el MISMO comentario con un
 * comment.id distinto (observado en producción: hasta 7 ids distintos para un
 * mismo comentario). El dedup clásico por comment_id (processed_comments) no
 * detecta esas reentregas → el bot respondía varias veces al mismo comentario.
 *
 * La huella es estable entre entregas del mismo comentario, y el claim es
 * atómico (INSERT OR IGNORE sobre la PK dedup_key): solo UNA ejecución gana,
 * así que un comentario recibe UN único mensaje de respuesta, siempre.
 */
export interface FingerprintRow {
  dedupKey: string;
  ruleId: string;
  commentId: string;
  createdAt: number;
}

/**
 * Huella estable de un comentario: post + autor (id o username) + texto
 * normalizado (sin emojis/especiales, minúsculas, espacios colapsados).
 * Un mismo comentario reentregado por Zernio (con id distinto) produce la
 * MISMA huella; dos comentarios distintos de personas distintas no colisionan
 * (aunque digan lo mismo, cambia el autor; si son del mismo autor en el mismo
 * post con el mismo texto, es el mismo comentario en la práctica).
 */
export function commentFingerprint(postId: string, authorKey: string, text: string): string {
  const norm = stripSpecialCharacters(text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const author = (authorKey ?? "").trim().toLowerCase();
  return `${postId ?? ""}|${author}|${norm}`;
}

export class FingerprintsRepo {
  constructor(private readonly db: Db) {}

  /** ¿Ya se respondió (o está en proceso) a este comentario, por huella? */
  async exists(dedupKey: string): Promise<boolean> {
    const row = await this.db.first<{ n: number }>(
      "SELECT COUNT(*) as n FROM comment_fingerprints WHERE dedup_key = ?",
      [dedupKey],
    );
    return (row?.n ?? 0) > 0;
  }

  /**
   * Claim atómico por huella: solo UNA ejecución gana (INSERT OR IGNORE sobre
   * la PK). Devuelve true si ganamos (podemos responder); false si otro
   * delivery del mismo comentario ya lo respondió o está respondiendo.
   */
  async claim(dedupKey: string, ruleId: string, commentId: string, at: number): Promise<boolean> {
    const res = await this.db.run(
      `INSERT INTO comment_fingerprints (dedup_key, rule_id, comment_id, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(dedup_key) DO NOTHING`,
      [dedupKey, ruleId, commentId, at],
    );
    return res.meta?.changes === 1;
  }
}
