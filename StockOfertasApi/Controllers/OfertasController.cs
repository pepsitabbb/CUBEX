using Microsoft.AspNetCore.Mvc;
using StockOfertasApi.Models;

namespace StockOfertasApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OfertasController : ControllerBase
{
    [HttpPost("evaluar-descuento")]
    public ActionResult<StockOfertaResponse> EvaluarDescuento([FromBody] StockOfertaRequest request)
    {
        decimal porcentajeDescuento = 0m;
        string mensaje = "Sin descuento disponible";

        // Lógica de negocio basada en el stock máximo de la tabla STOCK
        if (request.StockActual >= request.StockMaximo)
        {
            porcentajeDescuento = 0.20m; // 20% de descuento por sobreinventario
            mensaje = "Descuento del 20% aplicado por exceso de stock máximo";
        }
        else if (request.StockActual >= (request.StockMaximo * 0.8))
        {
            porcentajeDescuento = 0.10m; // 10% de descuento
            mensaje = "Descuento del 10% por alto nivel de inventario";
        }

        decimal montoDescuento = request.PrecioOriginal * porcentajeDescuento;
        decimal precioFinal = request.PrecioOriginal - montoDescuento;

        var respuesta = new StockOfertaResponse
        {
            IdProducto = request.IdProducto,
            PrecioOriginal = request.PrecioOriginal,
            DescuentoAplicado = montoDescuento,
            PrecioFinal = precioFinal,
            Mensaje = mensaje
        };

        return Ok(respuesta);
    }
}