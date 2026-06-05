# Catálogo directo por WhatsApp

Un catálogo independiente que toma productos, variantes, fotos, precios y stock
de Tiendanube. Aplica un precio directo más bajo y arma el pedido para enviarlo
por WhatsApp.

## Qué incluye

- Catálogo adaptable a celular y computadora.
- Productos de Tiendanube en modo sólo lectura.
- Descuento general y precios especiales por producto.
- Búsqueda, variantes, control de stock y carrito.
- Mensaje de WhatsApp con cantidades, variantes, total, nombre y localidad.
- Productos de demostración mientras se configura la conexión real.

## Probarlo

Necesitás Node.js 18 o superior.

```bash
npm start
```

Abrí `http://localhost:3000`.

## Configurar el negocio

1. Copiá `.env.example` como `.env`.
2. Completá `STORE_NAME`, `WHATSAPP_NUMBER` y `DEFAULT_DISCOUNT`.
3. Reiniciá la aplicación.

El número de WhatsApp debe tener código de país y área, sólo con números. Para
Argentina suele tener este formato: `549` + código de área + número.

También podés cambiar estos datos desde el engranaje del catálogo. Esos cambios
quedan guardados en el navegador de ese dispositivo.

## Conectar Tiendanube

La API oficial requiere una aplicación autorizada por OAuth 2 con el permiso
`read_products`.

1. Creá una aplicación en el portal de socios de Tiendanube.
2. Solicitá únicamente el permiso `read_products`.
3. Instalá la aplicación en tu tienda y completá el flujo de autorización.
4. Guardá en `.env` el `user_id` recibido como `TIENDANUBE_STORE_ID`.
5. Guardá el token recibido como `TIENDANUBE_ACCESS_TOKEN`.
6. Configurá `APP_USER_AGENT` con el nombre de tu aplicación y un email real.

Nunca pongas el token en `public/app.js`, HTML, enlaces ni mensajes. El servidor
ya hace la consulta de productos sin exponerlo al cliente.

Documentación oficial:

- Autenticación: https://tiendanube.github.io/api-documentation/authentication
- Productos: https://tiendanube.github.io/api-documentation/resources/product

## Importante sobre los pedidos

Este MVP no crea una orden dentro de Tiendanube. Envía una solicitud de pedido
por WhatsApp y conserva el stock de Tiendanube como referencia. La confirmación,
el medio de pago, el envío y cualquier actualización de stock se coordinan
después.
