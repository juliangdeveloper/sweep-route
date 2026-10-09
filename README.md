# 🧹 Sweep Route

Planificador de rutas de barrido. Carga un plano (o dibuja en blanco), pinta las áreas transitables, define el ancho del barredor y la app calcula la ruta más corta que cubre todo sin salirse del área marcada.

**https://juliangdeveloper.github.io/sweep-route/**

## Cómo usar

1. **🖼️ Cargar plano** (opcional): sube la imagen de un plano o usa el lienzo en blanco.
2. **📏 Calibrar**: traza una línea sobre una distancia conocida (ej. una pared) y digita sus metros. Sin calibrar, los resultados salen en píxeles.
3. **🖌️ Pinta las áreas transitables** con pincel, ▭ rectángulo, 🪣 llenar o borra con 🧽 goma. Lo que no pintes = bloqueado (muebles, muros).
4. **🚩 Marca el inicio** de la ruta con un clic sobre el área pintada.
5. Define el **ancho del barredor** (en metros) y activa **↩ regresar al inicio** si quieres un circuito cerrado.
6. **⚡ Calcular**: elige el modo — **🧹 Cubrir todo** (zigzag con el ancho de la escoba), **1️⃣ Sin repetir** (un solo trazado que recorre cada punto una sola vez, sin repasar zonas; compatible con regresar al inicio, el cierre va como tránsito) o **📍 Visitar zonas** (ruta corta que solo toca cada zona).
7. La ruta se anima sobre el plano mostrando la superficie barrida y la longitud total. El proyecto se autoguarda en tu navegador.

## Algoritmo

- Modelo raster: el área pintada es una grilla de ~4 px/celda.
- **Caminos**: 8 direcciones (ortogonal costo 1, diagonal √2). Un paso diagonal no corta esquinas: las dos celdas ortogonales vecinas tienen que ser transitables. El tránsito entre dos puntos usa A*; las distancias entre muchas zonas salen de un Dijkstra de fuente única por punto. Un atajo recto solo se acepta si el segmento no toca ninguna celda bloqueada (supercover entre centros de celda).
- **Cobertura**: descomposición en franjas serpenteantes espaciadas al ancho del barredor, por componente conexo; elige la orientación que minimiza giros y ordena componentes por vecino más cercano. Une franjas y componentes por el interior (recto si el tramo está libre; si no, por el camino de 8 direcciones).
- **Sin repetir**: por componente (el más cercano primero), submuestrea el área en una grilla gruesa (paso de 1–3 celdas según el ancho del barredor) y la recorre con un paseo voraz que visita cada nodo una sola vez; si se atasca, el salto punteado sigue el interior cuando hay camino. Las entradas a cada componente y el regreso al inicio van como tránsito punteado.
- **Visitar**: puntos de interés dispersos + distancias por Dijkstra de fuente única (una búsqueda por punto, no una por par) + TSP aproximado (vecino cercano + 2-opt).
- Solo las zonas sin camino interior se unen con un salto punteado, que sí puede cruzar lo no pintado. Ningún tramo con camino disponible atraviesa celdas bloqueadas.

100% cliente: un solo HTML, sin dependencias, sin servidor.

---
Hecho con ❤️ y 🧹 · [juliangdeveloper](https://github.com/juliangdeveloper)
