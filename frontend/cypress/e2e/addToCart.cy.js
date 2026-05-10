describe('Add to Cart Flow', () => {
  it('adds a product to the cart successfully', () => {
    cy.visit('/products');
    cy.get('button').contains('Add to Cart').first().click();

    cy.get('a').contains('Cart').click();
    cy.url().should('include', '/cart');
    cy.contains('Product 1');
  });
});