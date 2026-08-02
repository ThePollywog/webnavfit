// Vuetify instance — clean, professional enterprise theme (light).
import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import { createVuetify } from "vuetify";

// Restrained, corporate palette: slate ink, indigo primary, subtle surfaces.
const proTheme = {
  dark: false,
  colors: {
    background: "#f4f6f9",
    surface: "#ffffff",
    "surface-variant": "#e8ecf2",
    "on-surface-variant": "#4a5568",
    primary: "#1f3a5f",        // deep slate-blue
    "primary-darken-1": "#152a45",
    secondary: "#3b6ea5",      // accent blue
    accent: "#3b6ea5",
    error: "#c0392b",
    info: "#3b6ea5",
    success: "#2e7d4f",
    warning: "#b7791f",
    "on-primary": "#ffffff",
    "on-secondary": "#ffffff",
    "on-background": "#1a202c",
    "on-surface": "#1a202c",
  },
  variables: {
    "border-color": "#cbd5e0",
    "border-opacity": 0.8,
    "high-emphasis-opacity": 0.9,
    "medium-emphasis-opacity": 0.65,
  },
};

export default createVuetify({
  theme: {
    defaultTheme: "proTheme",
    themes: { proTheme },
  },
  defaults: {
    VBtn: { style: "text-transform: none; letter-spacing: 0.2px;" },
    VTextField: { variant: "outlined", density: "compact", hideDetails: "auto" },
    VSelect: { variant: "outlined", density: "compact", hideDetails: "auto" },
    VTextarea: { variant: "outlined", density: "compact", hideDetails: "auto" },
    VCard: { color: "surface" },
    VAppBar: { flat: true },
  },
});
