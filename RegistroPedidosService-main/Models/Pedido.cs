using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PedidosService.Models;

[Table("PEDIDOS")]
public class Pedido
{
    [Key]
    [Column("id")]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    [Required]
    [Column("id_carrito")]
    public int IdCarrito { get; set; }

    [Required]
    [Column("id_cliente")]
    public int IdCliente { get; set; }

    [Required]
    [Column("id_direccion")]
    public int IdDireccion { get; set; }

    [Required]
    [Column("id_tipo_pago")]
    public int IdTipoPago { get; set; }

    [Column("id_tarjeta")]
    public int? IdTarjeta { get; set; } 

    [Required]
    [Column("fecha")]
    public DateTime Fecha { get; set; } = DateTime.UtcNow;

    [Required]
    [MaxLength(50)]
    [Column("estado")]
    public string Estado { get; set; } = "Pendiente";
}