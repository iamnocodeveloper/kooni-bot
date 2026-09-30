-- Idioma del panel por usuario (kooni-paneles): 'es' | 'en'.
-- Preferencia de UI del operador, independiente de BOT_LANGUAGE (el idioma que
-- el bot le habla a los clientes). ensure_profile() inserta sin esta columna,
-- así que toma el default 'es'; la RLS profiles_update ya permite editarla.
alter table public.profiles
  add column if not exists language text not null default 'es';

alter table public.profiles
  drop constraint if exists profiles_language_check;

alter table public.profiles
  add constraint profiles_language_check check (language in ('es', 'en'));
