using MySqlConnector;
using ProductosApi.Models;

namespace ProductosApi.Data;

/// <summary>
/// Toda la interacción con MySQL vive aquí. El resto de la aplicación
/// (controladores, servicios) nunca escribe SQL directamente: solo
/// llama a estos métodos. Esto facilita que, si algún día cambia el
/// motor de base de datos, solo se toque este archivo.
/// </summary>
public class ProductoRepository
{
    private readonly string _connectionString;

    public ProductoRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("TiendaPcDatabase")
            ?? throw new InvalidOperationException("No se encontró la cadena de conexión 'TiendaPcDatabase'.");
    }

    /// <summary>
    /// Verifica que el proveedor exista antes de intentar el insert,
    /// para poder devolver un 404 claro en vez de un error de FK crudo.
    /// </summary>
    public async Task<bool> ExisteProveedorAsync(int idProveedor)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = "SELECT COUNT(1) FROM PROVEEDORES WHERE id = @idProveedor";
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@idProveedor", idProveedor);

        var count = Convert.ToInt32(await command.ExecuteScalarAsync());
        return count > 0;
    }

    /// <summary>
    /// Inserta el producto y su stock inicial dentro de UNA sola
    /// transacción: si falla cualquiera de los dos inserts, no queda
    /// ningún registro huérfano en PRODUCTOS.
    /// </summary>
    public async Task<int> CrearProductoConStockAsync(ProductoRequest request)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        await using var transaction = await connection.BeginTransactionAsync();
        try
        {
            const string insertProducto = @"
                INSERT INTO PRODUCTOS
                    (nombre, descripcion, lote, serie, caducidad, id_proveedor, costo, precio)
                VALUES
                    (@nombre, @descripcion, @lote, @serie, @caducidad, @idProveedor, @costo, @precio);
                SELECT LAST_INSERT_ID();";

            await using var productoCommand = new MySqlCommand(insertProducto, connection, (MySqlTransaction)transaction);
            productoCommand.Parameters.AddWithValue("@nombre", request.Nombre);
            productoCommand.Parameters.AddWithValue("@descripcion", (object?)request.Descripcion ?? DBNull.Value);
            productoCommand.Parameters.AddWithValue("@lote", (object?)request.Lote ?? DBNull.Value);
            productoCommand.Parameters.AddWithValue("@serie", (object?)request.Serie ?? DBNull.Value);
            productoCommand.Parameters.AddWithValue("@caducidad", (object?)request.Caducidad ?? DBNull.Value);
            productoCommand.Parameters.AddWithValue("@idProveedor", request.IdProveedor);
            productoCommand.Parameters.AddWithValue("@costo", request.Costo);
            productoCommand.Parameters.AddWithValue("@precio", request.Precio);

            var idProducto = Convert.ToInt32(await productoCommand.ExecuteScalarAsync());

            const string insertStock = @"
                INSERT INTO STOCK (id_producto, stock_actual, stock_minimo, stock_maximo)
                VALUES (@idProducto, @stockActual, @stockMinimo, @stockMaximo);";

            await using var stockCommand = new MySqlCommand(insertStock, connection, (MySqlTransaction)transaction);
            stockCommand.Parameters.AddWithValue("@idProducto", idProducto);
            stockCommand.Parameters.AddWithValue("@stockActual", request.StockActual);
            stockCommand.Parameters.AddWithValue("@stockMinimo", request.StockMinimo);
            stockCommand.Parameters.AddWithValue("@stockMaximo", request.StockMaximo);

            await stockCommand.ExecuteNonQueryAsync();

            await transaction.CommitAsync();
            return idProducto;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<ProductoResponse?> ObtenerPorIdAsync(int id)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
            SELECT p.id, p.nombre, p.descripcion, p.lote, p.serie, p.caducidad,
                   p.id_proveedor, p.costo, p.precio,
                   s.stock_actual, s.stock_minimo, s.stock_maximo
            FROM PRODUCTOS p
            JOIN STOCK s ON s.id_producto = p.id
            WHERE p.id = @id";

        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@id", id);

        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        return LeerProducto(reader);
    }

    public async Task<List<ProductoResponse>> ObtenerTodosAsync()
    {
        var resultado = new List<ProductoResponse>();

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
            SELECT p.id, p.nombre, p.descripcion, p.lote, p.serie, p.caducidad,
                   p.id_proveedor, p.costo, p.precio,
                   s.stock_actual, s.stock_minimo, s.stock_maximo
            FROM PRODUCTOS p
            JOIN STOCK s ON s.id_producto = p.id
            ORDER BY p.id DESC";

        await using var command = new MySqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            resultado.Add(LeerProducto(reader));
        }

        return resultado;
    }

    private static ProductoResponse LeerProducto(MySqlDataReader reader)
    {
        return new ProductoResponse
        {
            Id = reader.GetInt32("id"),
            Nombre = reader.GetString("nombre"),
            Descripcion = reader.IsDBNull(reader.GetOrdinal("descripcion")) ? null : reader.GetString("descripcion"),
            Lote = reader.IsDBNull(reader.GetOrdinal("lote")) ? null : reader.GetString("lote"),
            Serie = reader.IsDBNull(reader.GetOrdinal("serie")) ? null : reader.GetString("serie"),
            Caducidad = reader.IsDBNull(reader.GetOrdinal("caducidad")) ? null : reader.GetDateTime("caducidad"),
            IdProveedor = reader.GetInt32("id_proveedor"),
            Costo = reader.GetDecimal("costo"),
            Precio = reader.GetDecimal("precio"),
            StockActual = reader.GetInt32("stock_actual"),
            StockMinimo = reader.GetInt32("stock_minimo"),
            StockMaximo = reader.GetInt32("stock_maximo")
        };
    }
}
