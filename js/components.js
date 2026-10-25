"use strict";

const HEADER_HTML = `
  <header class="header">
  <div class="ribbon">Become a member and get extra 10% off · Use code WELCOME10</div>
  <div class="navbar">
    <button class="menu-btn" id="menuBtn"><i class="fas fa-bars"></i></button>
    <a href="/" class="logo">Peacock<span class="my">Fashions</span></a>
    <ul class="main-nav">
      <li><a href="/listing.html?cat=Men">Men <i class="fas fa-chevron-down"></i></a>
        <div class="dropdown">
          <h5>Topwear</h5>
          <a href="/listing.html?cat=Men&subcat=T-Shirts">T-Shirts</a>
          <a href="/listing.html?cat=Men&subcat=Shirts">Shirts</a>
          <a href="/listing.html?cat=Men&subcat=Blazers">Blazers</a>
          <h5>Bottomwear</h5>
          <a href="/listing.html?cat=Men&subcat=Jeans">Jeans</a>
        </div>
      </li>
      <li><a href="/listing.html?cat=Women">Women <i class="fas fa-chevron-down"></i></a>
        <div class="dropdown">
          <h5>Explore Women</h5>
          <a href="/listing.html?cat=Women&subcat=Dresses">Dresses</a>
          <a href="/listing.html?cat=Women&subcat=Night Dresses">Night Dresses</a>
        </div>
      </li>
      <li><a href="/listing.html?cat=Kids">Kids <i class="fas fa-chevron-down"></i></a>
        <div class="dropdown">
          <h5>Kids Wear</h5>
          <a href="/listing.html?cat=Kids&subcat=Boys">Boys</a>
          <a href="/listing.html?cat=Kids&subcat=Girls">Girls</a>
          <a href="/listing.html?cat=Kids">All Kids</a>
        </div>
      </li>
      <li><a href="/listing.html?cat=Accessories">Accessories <i class="fas fa-chevron-down"></i></a>
        <div class="dropdown">
          <a href="/listing.html?cat=Accessories&subcat=Bags">Bags</a>
          <a href="/listing.html?cat=Accessories&subcat=Scarves">Scarves</a>
          <a href="/listing.html?cat=Accessories&subcat=Jewellery">Jewellery</a>
        </div>
      </li>
    </ul>
    <div class="search">
      <i class="fas fa-magnifying-glass"></i>
      <input type="text" id="searchInput" placeholder="Search for products, brands and more">
    </div>
    <div class="header-icons">
      <a class="hic" href="/admin" target="_blank" rel="noopener" title="Peacock Admin"><i class="fas fa-user-gear"></i><span>Admin</span></a>
      <span class="hic" id="wishBtn"><i class="fas fa-heart"></i><span class="count" id="wishCount">0</span>Wishlist</span>
      <span class="hic" id="appInstallBtn" title="Install app"><i class="fas fa-download"></i><span>Install</span></span>
      <span class="hic" id="bagBtn"><i class="fas fa-shopping-bag"></i><span class="count" id="bagCount">0</span>Bag</span>
    </div>
  </div>
  </header>
`;

const FOOTER_HTML = `
  <div class="app-banner">
    <div class="container inner">
      <div>
        <h3>Find it now. Keep it forever.</h3>
        <p>Get the latest collection on the go with the Peacock Fashions app.</p>
        <div class="store-btns">
          <span><i class="fab fa-apple"></i> App Store</span>
          <span><i class="fab fa-google-play"></i> Google Play</span>
        </div>
      </div>
      <i class="fas fa-bag-shopping" style="font-size:3rem;opacity:.4"></i>
    </div>
  </div>
  <div class="footer-grid container">
    <div class="footer-col">
      <div class="brand">Peacock<span class="my" style="color:var(--pink)">Fashions</span></div>
      <p>Considered pieces designed to be worn, loved and kept.</p>
    </div>
    <div class="footer-col">
      <h4>Shop</h4>
      <a href="/listing.html?cat=Men">Men</a>
      <a href="/listing.html?cat=Women">Women</a>
      <a href="/listing.html?cat=Kids">Kids</a>
      <a href="/listing.html?cat=Accessories">Accessories</a>
    </div>
    <div class="footer-col">
      <h4>Help</h4>
      <a href="/track.html">Track order</a>
      <a href="/pages/shipping.html">Shipping</a>
      <a href="/pages/returns.html">Returns</a>
      <a href="/pages/size-guide.html">Size guide</a>
      <a href="/pages/contact.html">Contact</a>
    </div>
    <div class="footer-col">
      <h4>Company</h4>
      <a href="/pages/about.html">Our Story</a>
      <a href="/pages/about.html">Sustainability</a>
      <a href="/pages/about.html">Careers</a>
    </div>
    <div class="footer-col">
      <h4>Follow us</h4>
      <a href="#"><i class="fab fa-instagram"></i> Instagram</a>
      <a href="#"><i class="fab fa-facebook"></i> Facebook</a>
      <a href="#"><i class="fab fa-pinterest"></i> Pinterest</a>
    </div>
  </div>
  <div class="footer-bottom">© 2026 Peacock Fashions · Built like the fashion you love · <a href="/admin" target="_blank" rel="noopener">Admin</a></div>
`;

function mountApp() {
  const h = document.getElementById("app-header");
  const f = document.getElementById("app-footer");
  if (h) h.innerHTML = HEADER_HTML;
  if (f) f.innerHTML = FOOTER_HTML;
}