namespace AlertaStockMinimo
{
    partial class FormPrincipal
    {
        /// <summary>
        ///  Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        ///  Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        ///  Required method for Designer support - do not modify
        ///  the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            LblTitulo = new Label();
            lblId = new Label();
            lblNombre = new Label();
            lblCantidad = new Label();
            lblMinimo = new Label();
            txtIdProducto = new TextBox();
            txtNombreProducto = new TextBox();
            numCantidadActual = new NumericUpDown();
            numStockMinimo = new NumericUpDown();
            btnVerificar = new Button();
            txtResultado = new TextBox();
            ((System.ComponentModel.ISupportInitialize)numCantidadActual).BeginInit();
            ((System.ComponentModel.ISupportInitialize)numStockMinimo).BeginInit();
            SuspendLayout();
            // 
            // LblTitulo
            // 
            LblTitulo.AutoSize = true;
            LblTitulo.Location = new Point(266, 9);
            LblTitulo.Name = "LblTitulo";
            LblTitulo.Size = new Size(258, 20);
            LblTitulo.TabIndex = 0;
            LblTitulo.Text = "PRUEBA - ALERTA DE STOCK MÍNIMO";
            LblTitulo.Click += LblTitulo_Click;
            // 
            // lblId
            // 
            lblId.AutoSize = true;
            lblId.Location = new Point(233, 76);
            lblId.Name = "lblId";
            lblId.Size = new Size(91, 20);
            lblId.TabIndex = 1;
            lblId.Text = "ID Producto:";
            // 
            // lblNombre
            // 
            lblNombre.AutoSize = true;
            lblNombre.Location = new Point(233, 114);
            lblNombre.Name = "lblNombre";
            lblNombre.Size = new Size(131, 20);
            lblNombre.TabIndex = 2;
            lblNombre.Text = "Nombre Producto:";
            // 
            // lblCantidad
            // 
            lblCantidad.AutoSize = true;
            lblCantidad.Location = new Point(233, 152);
            lblCantidad.Name = "lblCantidad";
            lblCantidad.Size = new Size(118, 20);
            lblCantidad.TabIndex = 3;
            lblCantidad.Text = "Cantidad Actual:";
            // 
            // lblMinimo
            // 
            lblMinimo.AutoSize = true;
            lblMinimo.Location = new Point(233, 191);
            lblMinimo.Name = "lblMinimo";
            lblMinimo.Size = new Size(103, 20);
            lblMinimo.TabIndex = 4;
            lblMinimo.Text = "Stock Mínimo:";
            // 
            // txtIdProducto
            // 
            txtIdProducto.Location = new Point(412, 76);
            txtIdProducto.Name = "txtIdProducto";
            txtIdProducto.Size = new Size(125, 27);
            txtIdProducto.TabIndex = 5;
            // 
            // txtNombreProducto
            // 
            txtNombreProducto.Location = new Point(412, 114);
            txtNombreProducto.Name = "txtNombreProducto";
            txtNombreProducto.Size = new Size(125, 27);
            txtNombreProducto.TabIndex = 6;
            // 
            // numCantidadActual
            // 
            numCantidadActual.Location = new Point(412, 145);
            numCantidadActual.Name = "numCantidadActual";
            numCantidadActual.Size = new Size(125, 27);
            numCantidadActual.TabIndex = 7;
            // 
            // numStockMinimo
            // 
            numStockMinimo.Location = new Point(412, 184);
            numStockMinimo.Name = "numStockMinimo";
            numStockMinimo.Size = new Size(125, 27);
            numStockMinimo.TabIndex = 8;
            // 
            // btnVerificar
            // 
            btnVerificar.ImageAlign = ContentAlignment.TopLeft;
            btnVerificar.Location = new Point(287, 244);
            btnVerificar.Name = "btnVerificar";
            btnVerificar.Size = new Size(189, 29);
            btnVerificar.TabIndex = 9;
            btnVerificar.Text = "VERIFICAR STOCK";
            btnVerificar.UseVisualStyleBackColor = true;
            btnVerificar.Click += btnVerificar_Click;
            // 
            // txtResultado
            // 
            txtResultado.Location = new Point(193, 279);
            txtResultado.Multiline = true;
            txtResultado.Name = "txtResultado";
            txtResultado.ReadOnly = true;
            txtResultado.Size = new Size(365, 215);
            txtResultado.TabIndex = 10;
            // 
            // FormPrincipal
            // 
            AutoScaleDimensions = new SizeF(8F, 20F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = Color.PowderBlue;
            ClientSize = new Size(800, 526);
            Controls.Add(txtResultado);
            Controls.Add(btnVerificar);
            Controls.Add(numStockMinimo);
            Controls.Add(numCantidadActual);
            Controls.Add(txtNombreProducto);
            Controls.Add(txtIdProducto);
            Controls.Add(lblMinimo);
            Controls.Add(lblCantidad);
            Controls.Add(lblNombre);
            Controls.Add(lblId);
            Controls.Add(LblTitulo);
            Name = "FormPrincipal";
            Text = "Form1";
            ((System.ComponentModel.ISupportInitialize)numCantidadActual).EndInit();
            ((System.ComponentModel.ISupportInitialize)numStockMinimo).EndInit();
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private Label LblTitulo;
        private Label lblId;
        private Label lblNombre;
        private Label lblCantidad;
        private Label lblMinimo;
        private TextBox txtIdProducto;
        private TextBox txtNombreProducto;
        private NumericUpDown numCantidadActual;
        private NumericUpDown numStockMinimo;
        private Button btnVerificar;
        private TextBox txtResultado;
    }
}
