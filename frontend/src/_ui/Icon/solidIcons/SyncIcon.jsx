import React from 'react';

const Sync = ({ fill = '#C1C8CD', width = '25', className = '', viewBox = '0 0 25 25' }) => (
  <svg
    width={width}
    height={width}
    viewBox={viewBox}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M22.5 6.28906C22.5 8.22206 20.933 9.78906 19 9.78906C17.8988 9.78906 16.9163 9.28048 16.2747 8.48538C16.2522 8.49984 16.2287 8.51324 16.2042 8.52548L9.46659 11.8943C9.44233 11.9064 9.41773 11.9171 9.39289 11.9264C9.46283 12.2023 9.5 12.4914 9.5 12.7891C9.5 13.0868 9.46283 13.3758 9.39288 13.6517C9.41773 13.661 9.44233 13.6717 9.46659 13.6838L16.2042 17.0527C16.2287 17.0649 16.2522 17.0783 16.2747 17.0927C16.9163 16.2976 17.8988 15.7891 19 15.7891C20.933 15.7891 22.5 17.3561 22.5 19.2891C22.5 21.2221 20.933 22.7891 19 22.7891C17.067 22.7891 15.5 21.2221 15.5 19.2891C15.5 18.9914 15.5372 18.7023 15.6071 18.4264C15.5823 18.4171 15.5577 18.4064 15.5334 18.3943L8.79577 15.0255C8.77129 15.0132 8.74777 14.9998 8.72525 14.9854C8.08366 15.7805 7.10122 16.2891 6 16.2891C4.067 16.2891 2.5 14.7221 2.5 12.7891C2.5 10.8561 4.067 9.28906 6 9.28906C7.10123 9.28906 8.08367 9.79765 8.72526 10.5927C8.74778 10.5783 8.77129 10.5649 8.79577 10.5527L15.5334 7.18384C15.5577 7.17171 15.5823 7.16102 15.6071 7.15173C15.5372 6.87578 15.5 6.58676 15.5 6.28906C15.5 4.35607 17.067 2.78906 19 2.78906C20.933 2.78906 22.5 4.35607 22.5 6.28906Z"
      fill={fill}
    />
  </svg>
);

export default Sync;