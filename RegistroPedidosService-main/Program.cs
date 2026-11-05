
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;

using PedidosService.Data;
using PedidosService.Services;

using PedidoServiceImpl = PedidosService.Services.PedidosService;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

// Conexión a MySQL
var connectionString = builder.Configuration.GetConnectionString("MySqlBDO2");

builder.Services.AddDbContext<PedidosDbContext>(options =>
    options.UseMySql(
        connectionString,
        ServerVersion.AutoDetect(connectionString)
    )
);

// Permitir solicitudes desde el frontend de CUBEX
builder.Services.AddCors(options =>
{
    options.AddPolicy("CUBEXFrontend", policy =>
    {
        policy
            .WithOrigins(
                "http://127.0.0.1:5500",
                "http://localhost:5500"
            )
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddScoped<IPedidosService, PedidoServiceImpl>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseCors("CUBEXFrontend");

app.UseAuthorization();

app.MapControllers();

app.Run();
