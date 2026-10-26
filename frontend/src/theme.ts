import { createTheme } from "@mui/material/styles";

export const colors = {
  ink: "#14213D",
  slate: "#5B677A",
  line: "#D8DEE6",
  canvas: "#EEF1F4",
  teal: "#0F766E",
  amber: "#B45309",
  rangeFill: "#BFD9D6",
};

export const theme = createTheme({
  palette: {
    primary: { main: colors.teal },
    error: { main: "#B42318" },
    text: { primary: colors.ink, secondary: colors.slate },
    background: { default: colors.canvas, paper: "#FFFFFF" },
    divider: colors.line,
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    h1: { fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.01em" },
    h2: { fontSize: "1.125rem", fontWeight: 600 },
    subtitle2: { fontWeight: 500, color: colors.slate },
    button: { textTransform: "none", fontWeight: 500 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { fontVariantNumeric: "tabular-nums" },
        "*:focus-visible": { outline: `2px solid ${colors.teal}`, outlineOffset: 2 },
      },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { defaultProps: { elevation: 0, variant: "outlined" } },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 600, color: colors.slate, whiteSpace: "nowrap" },
      },
    },
  },
});
