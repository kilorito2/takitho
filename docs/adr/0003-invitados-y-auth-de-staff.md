# ADR-0003: Clientes invitados; Auth solo para staff; autorización por rol

## Status
Accepted (pendiente de OK de Fase 0)

## Date
2026-10-21

## Context
Cada paso extra baja la conversión de un pedido de comida. Los clientes no necesitan cuenta. El staff (admin y cocina) sí necesita identidad y permisos distintos.

## Decision
- **Clientes:** sin login. Usan la *anon/publishable key* y solo pueden leer menú público y llamar Edge Functions públicas. Su historial vive en `localStorage` ("Mis pedidos").
- **Staff:** Supabase Auth con email + contraseña, sin registro público. El admin invita desde `/admin/staff` (`invite-staff`). Tabla `profiles(id, role)` con `role ∈ {admin, kitchen}`.
- **Autorización:** función `auth_role()` (`SECURITY DEFINER`, `search_path` fijo) usada en las políticas RLS. El rol **no** se toma de claims editables por el usuario.
- **Front:** guards de ruta (`/cocina`, `/admin/*`) para UX; la seguridad real es RLS + validación de rol dentro de las funciones de staff.
- **Edge Functions:** las públicas se despliegan sin exigir JWT de usuario (`verify_jwt = false`) y se protegen con validación Zod, rate limit, token de pedido y CORS; las de staff validan el JWT y el rol manualmente; `mp-webhook` valida la firma de MP.
  - *A verificar en Fase 3:* Supabase está migrando a claves `publishable/secret`; el comportamiento de `verify_jwt` con esas claves se confirma en la doc vigente antes de decidir cuál es la configuración definitiva.
- Service role: solo dentro de Edge Functions, nunca en el front ni en el repo.

## Alternatives Considered
- **Login opcional para clientes:** agrega superficie (recuperación de contraseña, privacidad) sin beneficio para v1.
- **PIN compartido para cocina:** simple pero sin trazabilidad ni revocación. Rechazado: la cocina usa un usuario con rol `kitchen`.

## Consequences
- No hay "mis pedidos" entre dispositivos (aceptado en PRD).
- Hay que testear RLS con pruebas negativas por rol.
- Si se pierde el celu del cocinero se revoca su usuario desde admin.
