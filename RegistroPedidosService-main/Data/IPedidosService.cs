using PedidosService.DTOs;
using PedidosService.Models;
using PedidosService.Data;
using Microsoft.EntityFrameworkCore;

namespace PedidosService.Services;

public interface IPedidosService
{
    Task<PedidoResponseDto> RegistrarPedidoAsync(CrearPedidoDto dto);

    Task<PedidoResponseDto?> ObtenerPorIdAsync(int id);
    Task<List<PedidoResponseDto>> ObtenerTodosAsync();

    Task<PedidoResponseDto?> ActualizarEstadoAsync(
    int id,
    string estado
);
}

public class PedidosService : IPedidosService
{
    private readonly PedidosDbContext _context;

    public PedidosService(PedidosDbContext context)
    {
        _context = context;
    }

    public async Task<PedidoResponseDto> RegistrarPedidoAsync(CrearPedidoDto dto)
    {
        var pedido = new Pedido
        {
            IdCarrito = dto.IdCarrito,
            IdCliente = dto.IdCliente,
            IdDireccion = dto.IdDireccion,
            IdTipoPago = dto.IdTipoPago,
            IdTarjeta = dto.IdTarjeta,
            Fecha = DateTime.UtcNow,
            Estado = "Pendiente"
        };

        _context.Pedidos.Add(pedido);

        await _context.SaveChangesAsync();

        return new PedidoResponseDto
        {
            Id = pedido.Id,
            IdCarrito = pedido.IdCarrito,
            IdCliente = pedido.IdCliente,
            IdDireccion = pedido.IdDireccion,
            IdTipoPago = pedido.IdTipoPago,
            IdTarjeta = pedido.IdTarjeta,
            Fecha = pedido.Fecha,
            Estado = pedido.Estado
        };
    }

    public async Task<PedidoResponseDto?> ObtenerPorIdAsync(int id)
    {
        var pedido = await _context.Pedidos.FindAsync(id);

        if (pedido is null)
            return null;

        return new PedidoResponseDto
        {
            Id = pedido.Id,
            IdCarrito = pedido.IdCarrito,
            IdCliente = pedido.IdCliente,
            IdDireccion = pedido.IdDireccion,
            IdTipoPago = pedido.IdTipoPago,
            IdTarjeta = pedido.IdTarjeta,
            Fecha = pedido.Fecha,
            Estado = pedido.Estado
        };
    }

    public async Task<List<PedidoResponseDto>> ObtenerTodosAsync()
{
    var pedidos = await _context.Pedidos
        .OrderByDescending(p => p.Fecha)
        .ToListAsync();

    return pedidos.Select(p => new PedidoResponseDto
    {
        Id = p.Id,
        IdCarrito = p.IdCarrito,
        IdCliente = p.IdCliente,
        IdDireccion = p.IdDireccion,
        IdTipoPago = p.IdTipoPago,
        IdTarjeta = p.IdTarjeta,
        Fecha = p.Fecha,
        Estado = p.Estado
    }).ToList();
}

public async Task<PedidoResponseDto?> ActualizarEstadoAsync(
    int id,
    string estado)
{
    var estadosPermitidos = new[]
    {
        "Pendiente",
        "Confirmado",
        "Cancelado"
    };

    if (!estadosPermitidos.Contains(
        estado,
        StringComparer.OrdinalIgnoreCase))
    {
        throw new ArgumentException(
            "El estado proporcionado no es válido.");
    }

    var pedido = await _context.Pedidos.FindAsync(id);

    if (pedido is null)
        return null;

    pedido.Estado = estado;

    await _context.SaveChangesAsync();

    return new PedidoResponseDto
    {
        Id = pedido.Id,
        IdCarrito = pedido.IdCarrito,
        IdCliente = pedido.IdCliente,
        IdDireccion = pedido.IdDireccion,
        IdTipoPago = pedido.IdTipoPago,
        IdTarjeta = pedido.IdTarjeta,
        Fecha = pedido.Fecha,
        Estado = pedido.Estado
    };
}

}

