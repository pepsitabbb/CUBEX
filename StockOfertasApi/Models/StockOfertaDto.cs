namespace StockOfertasApi.Models;

public class StockOfertaRequest
{
    public int IdProducto { get; set; }
    public int StockActual { get; set; }
    public int StockMaximo { get; set; }
    public decimal PrecioOriginal { get; set; }
}

public class StockOfertaResponse
{
    public int IdProducto { get; set; }
    public decimal PrecioOriginal { get; set; }
    public decimal DescuentoAplicado { get; set; }
    public decimal PrecioFinal { get; set; }
    public string Mensaje { get; set; } = string.Empty;
}