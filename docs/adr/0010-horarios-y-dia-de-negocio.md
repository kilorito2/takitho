# ADR-0010: Modelo de horarios con cruce de medianoche y "día de negocio"

## Status
Accepted (pendiente de OK de Fase 0)

## Date
2026-10-21

## Context
Takitho abre de noche (ej. 19:00–01:00). A las 00:30 del lunes el local sigue abierto "por el turno del domingo". Los reportes y los códigos de pedido no deben partirse a medianoche. Argentina no tiene horario de verano (UTC−3 fijo), pero igual se usa la zona IANA para no depender de eso.

## Decision
- `opening_hours(weekday 0..6, opens_at time, closes_at time)`, varias filas por día. Si `closes_at <= opens_at` el turno termina el día siguiente. Los turnos son **del día en que abren**.
- `hours.ts` (puro) expone:
  - `isOpenAt(now, hours, tz)`: convierte `now` a hora local con `Intl.DateTimeFormat(..., {timeZone})`, mira los turnos de hoy y los de ayer que cruzan medianoche.
  - `nextOpening(now, hours, tz)`: próximo `opens_at` (para "prendemos el comal a las 19 h").
  - `scheduleSlots(now, hours, tz, {prepMinutes, stepMinutes: 15, maxDays})`: franjas de 15 min dentro del horario, desde `now + prep`, sin cruzar turnos, hasta `maxDays`.
  - `businessDate(now, tz, cutoff = '06:00')`: fecha de negocio.
- Estado del local = `¬is_closed_manually ∧ isOpenAt` para inmediatos; `is_paused` bloquea inmediatos pero no programados; `is_closed_manually` es el interruptor del dueño.
- El front calcula para UI con la hora del dispositivo corregida por el header `Date` del servidor; **la autoridad es el servidor** en `create-order` con su propia hora.
- Casos de test obligatorios: 18:59/19:00/00:59/01:00/01:01; lunes 00:30 con turno del domingo; domingo→lunes; dos turnos el mismo día (13–16 y 20–00); turno 00:00–00:00 (24 h); programar a las 00:45 dentro del turno que arrancó ayer; dispositivo en otra zona horaria.

## Alternatives Considered
- **`tstzrange` en Postgres y calcular en SQL:** potente pero duplica lógica con el front. Se mantiene la regla en TS compartido.
- **Librería de fechas (date-fns-tz, Luxon):** el core debe ser sin dependencias; `Intl` alcanza.

## Consequences
- Los reportes agrupan por `business_date`, no por día calendario.
- El código de pedido reinicia su contador por `business_date`.
