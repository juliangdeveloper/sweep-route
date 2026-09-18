# 🧹 Sweep Route

Planificador de rutas de barrido. Carga un plano (o dibuja en blanco), pinta las áreas transitables, define el ancho del barredor y la app calcula la ruta más corta que cubre todo sin salirse del área marcada.

**https://juliangdeveloper.github.io/sweep-route/**

## Cómo usar

1. **🖼️ Cargar plano** (opcional): sube la imagen de un plano o usa el lienzo en blanco.
2. **📏 Calibrar**: traza una línea sobre una distancia conocida (ej. una pared) y digita sus metros. Sin calibrar, los resultados salen en píxeles.
3. **🖌️ Pinta las áreas transitables** con pincel, ▭ rectángulo, 🪣 llenar o borra con 🧽 goma. Lo que no pintes = bloqueado (muebles, muros).
4. **🚩 Marca el inicio** de la ruta con un clic sobre el área pintada.
5. Define el **ancho del barredor** (en metros) y activa **↩ regresar al inicio** si quieres un circuito cerrado.
6. **⚡ Calcular**: modo por defecto **cubre** todo (zigzag con el ancho de la escoba); activa **📍 modo visitar** para la ruta más corta que solo toca cada zona.
7. La ruta se anima sobre el plano y muestra la longitud total. El proyecto se autoguarda en tu navegador.

## Algoritmo

- Modelo raster: el área pintada es una grilla de ~4 px/celda.
- **Cobertura**: descomposición en franjas serpenteantes espaciadas al ancho del barredor, por componente conexo; elige la orientación que minimiza giros y ordena componentes por vecino más cercano, conectando con BFS por el interior del área.
- **Visitar**: puntos de interés dispersos + BFS entre ellos + TSP aproximado (vecino cercano + 2-opt).
- Las líneas entre zonas que cruzan muros se marcan punteadas (salto).

100% cliente: un solo HTML, sin dependencias, sin servidor.

---
Hecho con ❤️ y 🧹 · [juliangdeveloper](https://github.com/juliangdeveloper)
