import { themeQuartz, colorSchemeDarkBlue } from 'ag-grid-community';


export const disputeTheme = themeQuartz.withPart(colorSchemeDarkBlue).withParams({
  accentColor: '#009CDE',
  headerHeight: '44px',
  spacing: 10,
  wrapperBorder: false,
  selectedRowBackgroundColor: 'rgba(0, 156, 222, 0.15)',
});