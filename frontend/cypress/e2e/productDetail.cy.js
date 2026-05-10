describe('Product Detail Page', () => {
  beforeEach(() => {
    // Navigate to a sample product detail page
    cy.visit('/product/1');
  });

  it('should display product details', () => {
    cy.get('[data-testid="product-title"]').should('exist');
    cy.get('[data-testid="product-price"]').should('exist');
    cy.get('[data-testid="product-description"]').should('exist');
  });

  it('should allow adding the product to the cart', () => {
    cy.get('[data-testid="add-to-cart-button"]').click();
    cy.get('[data-testid="cart-count"]').should('contain', '1');
  });
});