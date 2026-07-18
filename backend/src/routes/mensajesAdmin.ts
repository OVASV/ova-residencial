import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();
const puedeResponder = requireRole("admin", "superadmin", "directiva");
const verMensajes = requireRole("admin", "superadmin", "directiva");

// GET /mensajes — todos los mensajes del complejo.
router.get("/", verMensajes, async (req, res) => {
  const msgs = await prisma.mensajes.findMany({
    where: { id_complejo: req.complejoId! },
    orderBy: { created_at: "desc" },
    include: {
      usuarios: { select: { nombre: true } },
      unidades: { select: { numero_propiedad: true } },
      respuestas_mensajes: {
        orderBy: { created_at: "asc" },
        select: { id: true, nombre_usuario: true, texto: true, created_at: true },
      },
    },
  });
  res.json(msgs.map((m) => ({
    id: m.id,
    categoria: m.categoria,
    asunto: m.asunto,
    mensaje: m.mensaje,
    estado: m.estado,
    id_unidad: m.id_unidad,
    numero_propiedad: m.unidades?.numero_propiedad ?? null,
    nombre_usuario: m.usuarios.nombre,
    fecha: m.created_at,
    respuestas: m.respuestas_mensajes.map((r) => ({
      id: r.id,
      nombre_usuario: r.nombre_usuario,
      texto: r.texto,
      fecha: r.created_at,
    })),
  })));
});

// PUT /mensajes/:id/responder — agregar respuesta a un mensaje.
router.put("/:id/responder", puedeResponder, async (req, res) => {
  const { respuesta } = req.body ?? {};
  if (!respuesta?.trim()) return res.status(400).json({ message: "Respuesta requerida" });

  const msg = await prisma.mensajes.findUnique({ where: { id: req.params.id } });
  if (!msg || msg.id_complejo !== req.complejoId) {
    return res.status(404).json({ message: "Mensaje no encontrado" });
  }

  const usuario = await prisma.usuarios.findUnique({ where: { id: req.user!.sub }, select: { nombre: true } });
  await prisma.$transaction([
    prisma.respuestas_mensajes.create({
      data: {
        id_mensaje: req.params.id,
        id_usuario: req.user!.sub,
        nombre_usuario: usuario?.nombre ?? "Usuario",
        texto: respuesta.trim(),
      },
    }),
    prisma.mensajes.update({
      where: { id: req.params.id },
      data: { estado: "respondido", respondido_por: usuario?.nombre ?? null, fecha_respuesta: new Date() },
    }),
  ]);
  res.json({ ok: true });
});

export default router;
