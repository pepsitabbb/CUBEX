using Microsoft.EntityFrameworkCore;
using PedidosService.Models;

namespace PedidosService.Data;

public class PedidosDbContext : DbContext
{
    public PedidosDbContext(DbContextOptions<PedidosDbContext> options)
        : base(options)
    {
    }

    public DbSet<Pedido> Pedidos => Set<Pedido>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Pedido>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.Property(e => e.Estado)
                .HasDefaultValue("Pendiente");

            entity.Property(e => e.Fecha)
                .HasDefaultValueSql("CURRENT_TIMESTAMP");
        });
    }
}