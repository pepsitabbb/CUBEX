using Microsoft.AspNetCore.Mvc;
using ProductosApi.Models;
using ProductosApi.Services;

namespace ProductosApi.Controllers;

[ApiController]
[Route("api/productos")]
public class ProductosController : ControllerBase
{
    private readonly ProductoService _service;

    public ProductosController(ProductoService service)
    {
        _service = service;
    }

    /// <summary>
    /// POST /api/productos
    /// Función principal asignada: agregar producto (+ su stock inicial).
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> AgregarProducto([FromBody] ProductoRequest request)
    {
        var resultado = await _service.AgregarProductoAsync(request);

        if (!resultado.Exitoso)
        {
            var error = new ApiError { Error = resultado.CodigoError!, Detalles = resultado.Errores };

            return resultado.CodigoError switch
            {
                "ProveedorNoExiste" => NotFound(error),
                _ => BadRequest(error)
            };
        }

        return CreatedAtAction(nameof(ObtenerProducto), new { id = resultado.Valor!.Id }, resultado.Valor);
    }

    /// <summary>
    /// GET /api/productos/{id}
    /// Útil para el frontend de prueba y para que otros servicios
    /// consulten un producto puntual.
    /// </summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> ObtenerProducto(int id)
    {
        var producto = await _service.ListarProductosAsync();
        var encontrado = producto.Find(p => p.Id == id);

        if (encontrado is null)
        {
            return NotFound(new ApiError
            {
                Error = "ProductoNoEncontrado",
                Detalles = new List<string> { $"No existe un producto con id {id}" }
            });
        }

        return Ok(encontrado);
    }

    /// <summary>
    /// GET /api/productos
    /// Lista todos los productos. No es parte de la función asignada,
    /// pero se incluye para poder probar visualmente que el POST
    /// funcionó (el frontend de prueba la usa).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> ListarProductos()
    {
        var productos = await _service.ListarProductosAsync();
        return Ok(productos);
    }
}
