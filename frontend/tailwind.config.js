/** @type {import('tailwindcss').Config} */
// Tokens del sistema de diseño — sección 3 del documento de especificaciones.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1a2233",
        page: "#f4f5f7",
        surface: "#fafbfc",
        sidebar: {
          bg: "#0C1B30",
          accent: "#085041",
          accentText: "#5DCAA5",
        },
        estado: {
          pagado: "#1D9E75",
          pendiente: "#EF9F27",
          atrasado: "#E24B4A",
        },
        cat: {
          seguridad: "#E24B4A",
          limpieza: "#EF9F27",
          mantenimiento: "#4A90D9",
          servicios: "#7B5EA7",
          administrativo: "#1D9E75",
          extraordinario: "#888888",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        base: "13px",
        tabla: "12px",
        etiqueta: "10px",
      },
    },
  },
  plugins: [],
};
