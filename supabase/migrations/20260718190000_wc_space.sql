-- Plan précis de l'appartement : le WC devient un espace à part entière.

alter table public.avatar_positions
  drop constraint avatar_positions_space_check;

alter table public.avatar_positions
  add constraint avatar_positions_space_check check (
    space in ('bureau', 'chambre', 'salon', 'balcon', 'dehors', 'sdb', 'couloir_int', 'couloir_ext', 'wc')
  );
