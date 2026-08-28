begin;

alter table public.homesrolo_homeowner_checkup_photos
  drop constraint if exists homesrolo_homeowner_checkup_photos_area_check;
alter table public.homesrolo_homeowner_checkup_photos
  add constraint homesrolo_homeowner_checkup_photos_area_check check (
    area is null or area in (
      'front_exterior', 'rear_exterior', 'roofline', 'attic', 'ceilings',
      'hvac', 'water_heater', 'foundation', 'gutters', 'siding',
      'windows_doors', 'drainage', 'other'
    )
  );

commit;
