if (window.tailwind) {
  window.tailwind.config = {
    theme: {
      extend: {
        colors: {
          paper: '#FFFBF5',
          'paper-dark': '#F5F0E6',
          'comic-blue': '#E0F7FA',
          'soft-blue': '#E3F2FD',
          'soft-green': '#E8F5E9',
          'soft-yellow': '#FFFDE7',
          'soft-pink': '#FCE4EC',
          'soft-purple': '#F3E5F5',
          primary: '#FF7043',
          'primary-hover': '#F4511E',
          accent: '#26A69A',
          'text-main': '#455A64',
          'text-sub': '#78909C',
        },
        fontFamily: {
          sans: ['Nunito', 'Inter', 'sans-serif'],
        },
        boxShadow: {
          soft: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
          card: '0 2px 8px rgba(0, 0, 0, 0.04)',
          float: '0 10px 30px -5px rgba(255, 112, 67, 0.15)',
        },
      },
    },
  };
}
