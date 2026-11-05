using System.ComponentModel.DataAnnotations;

namespace PedidosService.DTOs;

public class CrearPedidoDto
{
    [Required]
    [Range(1, int.MaxValue)]
    public int IdCarrito { get; set; }

    [Required]
    [Range(1, int.MaxValue)]
    public int IdCliente { get; set; }

    [Required]
    [Range(1, int.MaxValue)]
    public int IdDireccion { get; set; }

    [Required]
    [Range(1, int.MaxValue)]
    public int IdTipoPago { get; set; }

    [Range(1, int.MaxValue)]
    public int? IdTarjeta { get; set; }
}

public class PedidoResponseDto
{
    public int Id { get; set; }

    public int IdCarrito { get; set; }

    public int IdCliente { get; set; }

    public int IdDireccion { get; set; }

    public int IdTipoPago { get; set; }

    public int? IdTarjeta { get; set; }

    public DateTime Fecha { get; set; }

    public string Estado { get; set; } = string.Empty;
}

public class ActualizarEstadoPedidoDto
{
    [Required]
    [MaxLength(50)]
    public string Estado { get; set; } = string.Empty;
}