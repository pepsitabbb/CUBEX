using Microsoft.AspNetCore.Mvc;
using PedidosService.DTOs;
using PedidosService.Services;

namespace PedidosService.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PedidosController : ControllerBase
{
    private readonly IPedidosService _pedidosService;

    public PedidosController(IPedidosService pedidosService)
    {
        _pedidosService = pedidosService;
    }

    [HttpPost]
    public async Task<IActionResult> Crear([FromBody] CrearPedidoDto dto)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var nuevoPedido = await _pedidosService.RegistrarPedidoAsync(dto);

        return CreatedAtAction(
            nameof(ObtenerPorId),
            new { id = nuevoPedido.Id },
            nuevoPedido
        );
    }

    [HttpGet]
    public async Task<IActionResult> ObtenerTodos()
    {
        var pedidos = await _pedidosService.ObtenerTodosAsync();

        return Ok(pedidos);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> ObtenerPorId(int id)
    {
        if (id <= 0)
        {
            return BadRequest(new
            {
                mensaje = "El ID del pedido debe ser mayor que 0."
            });
        }

        var pedido = await _pedidosService.ObtenerPorIdAsync(id);

        if (pedido is null)
        {
            return NotFound(new
            {
                mensaje = $"No se encontró el pedido con ID {id}"
            });
        }

        return Ok(pedido);
    }

    [HttpPatch("{id:int}/estado")]
    public async Task<IActionResult> ActualizarEstado(
        int id,
        [FromBody] ActualizarEstadoPedidoDto dto)
    {
        if (id <= 0)
        {
            return BadRequest(new
            {
                mensaje = "El ID del pedido debe ser mayor que 0."
            });
        }

        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        PedidoResponseDto? pedido;

        try
        {
            pedido = await _pedidosService.ActualizarEstadoAsync(
                id,
                dto.Estado
            );
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new
            {
                mensaje = ex.Message
            });
        }

        if (pedido is null)
        {
            return NotFound(new
            {
                mensaje = $"No se encontró el pedido con ID {id}"
            });
        }

        return Ok(pedido);
    }
}