-- Índice de cobertura para la FK compuesta (pocket_id, user_id). El índice
-- por fecha empieza igual, pero no incluye user_id y el asesor no puede usarlo
-- para validar borrados o cambios del bolsillo padre.
create index savings_movements_pocket_user_idx
  on public.savings_movements (pocket_id, user_id);
